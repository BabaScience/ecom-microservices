import { Request, Response } from 'express';
import Joi from 'joi';
import axios from 'axios';
import mongoose from 'mongoose';
import crypto from 'crypto';
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
  try {
    const { error: validationError } = createOrderSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const user = (req as any).user;
    const userId = user.userId;
    const orderData: CreateOrderRequest = req.body;

    // Validate user exists
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:3001';
    const userResponse = await axios.get(`${userServiceUrl}/api/users/${userId}`);
    if (!userResponse.data.success) {
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    // Validate products and get product details (no inventory reservation here)
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
    const orderItems = [];
    let subtotal = 0;

    for (const item of orderData.items) {
      try {
        // Get product details
        const productResponse = await axios.get(`${productServiceUrl}/api/products/${item.productId}`, {
          timeout: 5000 // 5 second timeout
        });
        
        logger.info('Product service response', { 
          productId: item.productId, 
          status: productResponse.status,
          data: productResponse.data 
        });
        
        if (!productResponse.data.success) {
          return res.status(404).json(error('PRODUCT_NOT_FOUND', `Product ${item.productId} not found`));
        }

        const product = productResponse.data.data.product;
        
        // Validate product exists and has required fields
        if (!product) {
          return res.status(404).json(error('PRODUCT_NOT_FOUND', `Product ${item.productId} not found`));
        }

        // Validate product data structure
        if (typeof product.price !== 'number' || isNaN(product.price) || product.price <= 0) {
          logger.error('Invalid product price data', { 
            productId: item.productId, 
            price: product.price,
            product: product 
          });
          return res.status(400).json(error('INVALID_PRODUCT_DATA', `Invalid price data for product ${item.productId}`));
        }

        // Validate required fields
        if (!product.name || !product.sku) {
          return res.status(400).json(error('INVALID_PRODUCT_DATA', `Missing required fields for product ${item.productId}`));
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: itemTotal
        });
        
        logger.info('Product added to order', { 
          productId: item.productId, 
          name: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          totalPrice: itemTotal 
        });
      } catch (err) {
        logger.error('Failed to fetch product details', { 
          productId: item.productId, 
          error: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined
        });
        return res.status(503).json(error('PRODUCT_SERVICE_UNAVAILABLE', 'Product service is currently unavailable. Please try again later.'));
      }
    }

    // Validate that we have order items
    if (orderItems.length === 0) {
      return res.status(400).json(error('INVALID_ORDER', 'No valid products found for order'));
    }

    // Validate subtotal is valid
    if (isNaN(subtotal) || subtotal <= 0) {
      return res.status(400).json(error('INVALID_ORDER', 'Invalid order total calculated'));
    }

    // Calculate totals (simplified - no tax/shipping for now)
    const tax = 0;
    const shipping = 0;
    const discount = 0;
    const total = subtotal + tax + shipping - discount;

    logger.info('Order calculation', { 
      subtotal, 
      tax, 
      shipping, 
      discount, 
      total,
      itemCount: orderItems.length 
    });

    // Generate order number and saga ID manually
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `ORD-${timestamp}-${random}`;
    const sagaId = crypto.randomUUID();

    // Create order with saga fields
    const order = new Order({
      orderNumber,
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
        id: sagaId,
        status: 'in_progress',
        currentStep: 'order_created',
        completedSteps: [],
        compensatedSteps: []
      }
    });

    console.log('Order object before save:', {
      orderNumber: order.orderNumber,
      sagaId: order.saga.id,
      isNew: order.isNew
    });

    await order.save();

    console.log('Order object after save:', {
      orderNumber: order.orderNumber,
      sagaId: order.saga.id,
      _id: order._id
    });

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

    // Save event to outbox (without transaction)
    const outboxPublisher = new OutboxPublisher(null as any); // We'll initialize this properly
    await outboxPublisher.saveEvent(null, orderCreatedEvent);

    // Start the saga orchestrator (async)
    try {
      await sagaOrchestrator.startOrderSaga((order._id as any).toString());
    } catch (err) {
      logger.error('Failed to start saga', { orderId: order._id, error: err });
      // Don't fail the order creation if saga fails to start
    }

    // Enqueue notification job (async)
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
    logger.error('Create order error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to create order'));
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
