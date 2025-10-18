import { Request, Response } from 'express';
import Joi from 'joi';
import axios from 'axios';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { OutboxPublisher } from '../services/outboxPublisher';
import { ok, error, logger, authMiddleware, adminMiddleware, eventPublisher, EventTypes, OrderCreatedData } from '@repo/shared';
import { CreateOrderRequest, UpdateOrderStatusRequest } from '@repo/shared';
import { enqueueOrderConfirmation } from '../queues/notificationQueue';
import { sagaOrchestrator } from '../saga/sagaOrchestrator';

const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      quantity: Joi.number().min(1).required()
    })
  ).min(1).required(),
  shippingAddress: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required()
  }).required()
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'payment_processing', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed').required(),
  note: Joi.string().optional()
});

const listOrdersSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  status: Joi.string().valid('pending', 'payment_processing', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed').optional()
});

export const createOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { error: validationError } = createOrderSchema.validate(req.body);
    if (validationError) {
      await session.abortTransaction();
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const user = (req as any).user;
    const userId = user.userId;
    const orderData: CreateOrderRequest = req.body;

    // Validate user exists
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:3001';
    const userResponse = await axios.get(`${userServiceUrl}/api/users/${userId}`);
    if (!userResponse.data.success) {
      await session.abortTransaction();
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    // Validate products and get product details (no inventory reservation here)
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
    const orderItems = [];
    let subtotal = 0;

    for (const item of orderData.items) {
      // Get product details
      const productResponse = await axios.get(`${productServiceUrl}/api/products/${item.productId}`);
      if (!productResponse.data.success) {
        await session.abortTransaction();
        return res.status(404).json(error('PRODUCT_NOT_FOUND', `Product ${item.productId} not found`));
      }

      const product = productResponse.data.data.product;

      const itemTotal = product.price.amount * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice: product.price.amount,
        totalPrice: itemTotal
      });
    }

    // Calculate totals (simplified - no tax/shipping for now)
    const tax = 0;
    const shipping = 0;
    const discount = 0;
    const total = subtotal + tax + shipping - discount;

    // Create order with saga fields
    const order = new Order({
      userId,
      items: orderItems,
      pricing: {
        subtotal,
        tax,
        shipping,
        discount,
        total
      },
      shippingAddress: orderData.shippingAddress,
      status: 'pending',
      saga: {
        id: crypto.randomUUID(),
        status: 'in_progress',
        currentStep: 'order_created',
        completedSteps: [],
        compensatedSteps: []
      }
    });

    await order.save({ session });

    // Create order created event
    const orderCreatedData: OrderCreatedData = {
      orderNumber: order.orderNumber,
      userId: order.userId,
      items: order.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      })),
      total: order.pricing.total,
      status: order.status,
      shippingAddress: order.shippingAddress
    };

    const orderCreatedEvent = eventPublisher.createEvent(
      EventTypes.ORDER_CREATED,
      (order._id as any).toString(),
      'Order',
      orderCreatedData,
      req.headers['x-correlation-id'] as string,
      null,
      userId
    );

    // Save event to outbox (within same transaction)
    const outboxPublisher = new OutboxPublisher(null as any); // We'll initialize this properly
    await outboxPublisher.saveEvent(session, orderCreatedEvent);

    // Commit transaction
    await session.commitTransaction();

    // Start the saga orchestrator (async, outside transaction)
    try {
      await sagaOrchestrator.startOrderSaga((order._id as any).toString());
    } catch (err) {
      logger.error('Failed to start saga', { orderId: order._id, error: err });
      // Don't fail the order creation if saga fails to start
    }

    // Enqueue notification job (outside transaction)
    try {
      await enqueueOrderConfirmation({
        orderId: (order._id as any).toString(),
        userId: order.userId,
        email: userResponse.data.data.user.email,
        orderDetails: {
          orderNumber: order.orderNumber,
          total: order.pricing.total,
          items: order.items
        }
      });
    } catch (err) {
      logger.warn('Failed to enqueue notification', { error: err });
      // Don't fail the order creation if notification fails
    }

    logger.info('Order created', { orderId: order._id, orderNumber: order.orderNumber });

    res.status(201).json(ok({ 
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        items: order.items,
        pricing: order.pricing,
        status: order.status,
        shippingAddress: order.shippingAddress,
        saga: {
          id: order.saga.id,
          status: order.saga.status,
          currentStep: order.saga.currentStep
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    }));
  } catch (err) {
    await session.abortTransaction();
    logger.error('Create order error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to create order'));
  } finally {
    session.endSession();
  }
};

export const listOrders = async (req: Request, res: Response) => {
  try {
    const { error: validationError, value } = listOrdersSchema.validate(req.query);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const user = (req as any).user;
    const userId = user.userId;
    const { page, limit, status } = value;

    // Build filter
    const filter: any = { userId };
    if (status) filter.status = status;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get orders and total count
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Order.countDocuments(filter)
    ]);

    logger.info('Orders listed', { userId, count: orders.length });

    res.json(ok({
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }));
  } catch (err) {
    logger.error('List orders error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to list orders'));
  }
};

export const getOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const userId = user.userId;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json(error('ORDER_NOT_FOUND', 'Order not found'));
    }

    res.json(ok({ order }));
  } catch (err) {
    logger.error('Get order error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to get order'));
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const userId = user.userId;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json(error('ORDER_NOT_FOUND', 'Order not found'));
    }

    if (order.status === 'cancelled') {
      return res.status(400).json(error('ORDER_ALREADY_CANCELLED', 'Order is already cancelled'));
    }

    if (['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json(error('ORDER_CANNOT_BE_CANCELLED', 'Order cannot be cancelled at this stage'));
    }

    // Update order status to cancelled
    order.status = 'cancelled';
    order.saga.status = 'compensating';
    await order.save();

    // Publish order cancelled event (this will trigger inventory release)
    const orderCancelledEvent = eventPublisher.createEvent(
      EventTypes.ORDER_CANCELLED,
      (order._id as any).toString(),
      'Order',
      {
        orderId: (order._id as any).toString(),
        reason: 'User requested cancellation'
      },
      req.headers['x-correlation-id'] as string,
      null,
      userId
    );

    await eventPublisher.publishOrderEvent(orderCancelledEvent);

    logger.info('Order cancelled', { orderId: order._id });

    res.json(ok({ order }));
  } catch (err) {
    logger.error('Cancel order error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to cancel order'));
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = updateOrderStatusSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { id } = req.params;
    const { status, note }: UpdateOrderStatusRequest = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json(error('ORDER_NOT_FOUND', 'Order not found'));
    }

    order.status = status;
    if (note) {
      order.statusHistory.push({
        status,
        timestamp: new Date(),
        note
      });
    }

    await order.save();

    logger.info('Order status updated', { orderId: order._id, status });

    res.json(ok({ order }));
  } catch (err) {
    logger.error('Update order status error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to update order status'));
  }
};
