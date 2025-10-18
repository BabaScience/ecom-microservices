import { Request, Response } from 'express';
import Joi from 'joi';
import { Product } from '../models/Product';
import { ok, error, logger, authMiddleware, adminMiddleware } from '@repo/shared';
import { CreateProductRequest, UpdateProductRequest, ReserveInventoryRequest } from '@repo/shared';
import { ProductEventPublisher } from '../events/publisher';

const createProductSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
  sku: Joi.string().required(),
  price: Joi.number().min(0).required(),
  currency: Joi.string().valid('USD', 'EUR', 'GBP').optional(),
  inventory: Joi.object({
    quantity: Joi.number().min(0).required()
  }).required(),
  category: Joi.string().required(),
  images: Joi.array().items(Joi.string()).optional(),
  specifications: Joi.object().optional()
});

const updateProductSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().optional(),
  price: Joi.number().min(0).optional(),
  currency: Joi.string().valid('USD', 'EUR', 'GBP').optional(),
  inventory: Joi.object({
    quantity: Joi.number().min(0).optional()
  }).optional(),
  category: Joi.string().optional(),
  images: Joi.array().items(Joi.string()).optional(),
  specifications: Joi.object().optional(),
  status: Joi.string().valid('active', 'inactive', 'discontinued').optional()
});

const reserveInventorySchema = Joi.object({
  quantity: Joi.number().min(1).required()
});

const listProductsSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  category: Joi.string().optional(),
  status: Joi.string().valid('active', 'inactive', 'discontinued').optional(),
  search: Joi.string().optional()
});

export const listProducts = async (req: Request, res: Response) => {
  try {
    const { error: validationError, value } = listProductsSchema.validate(req.query);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { page, limit, category, status, search } = value;

    // Build filter
    const filter: any = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get products and total count
    const [products, total] = await Promise.all([
      Product.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Product.countDocuments(filter)
    ]);

    logger.info('Products listed', { count: products.length, page, limit });

    res.json(ok({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }));
  } catch (err) {
    logger.error('List products error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to list products'));
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json(error('PRODUCT_NOT_FOUND', 'Product not found'));
    }

    res.json(ok({ product }));
  } catch (err) {
    logger.error('Get product error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to get product'));
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = createProductSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const productData: CreateProductRequest = req.body;

    // Check if SKU already exists
    const existingProduct = await Product.findOne({ sku: productData.sku });
    if (existingProduct) {
      return res.status(409).json(error('SKU_EXISTS', 'Product with this SKU already exists'));
    }

    const product = new Product({
      ...productData,
      inventory: {
        quantity: productData.inventory.quantity,
        reserved: 0
      }
    });

    await product.save();

    // Publish product created event
    try {
      await ProductEventPublisher.publishProductCreated(
        product._id.toString(),
        {
          name: product.name,
          sku: product.sku,
          price: product.price.amount,
          category: product.category,
          inventory: { quantity: product.inventory.quantity }
        },
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish product created event', { 
        productId: product._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail product creation if event publishing fails
    }

    logger.info('Product created', { productId: product._id, sku: product.sku });

    res.status(201).json(ok({ product }));
  } catch (err) {
    logger.error('Create product error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to create product'));
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = updateProductSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { id } = req.params;
    const updates: UpdateProductRequest = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json(error('PRODUCT_NOT_FOUND', 'Product not found'));
    }

    // Publish product updated event
    try {
      await ProductEventPublisher.publishProductUpdated(
        product._id.toString(),
        updates,
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish product updated event', { 
        productId: product._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail product update if event publishing fails
    }

    logger.info('Product updated', { productId: product._id });

    res.json(ok({ product }));
  } catch (err) {
    logger.error('Update product error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to update product'));
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      { status: 'discontinued' },
      { new: true }
    );

    if (!product) {
      return res.status(404).json(error('PRODUCT_NOT_FOUND', 'Product not found'));
    }

    // Publish product deleted event
    try {
      await ProductEventPublisher.publishProductDeleted(
        product._id.toString(),
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish product deleted event', { 
        productId: product._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail product deletion if event publishing fails
    }

    logger.info('Product deleted (soft)', { productId: product._id });

    res.json(ok({ message: 'Product deleted successfully' }));
  } catch (err) {
    logger.error('Delete product error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to delete product'));
  }
};

// DEPRECATED: These endpoints are deprecated in favor of Inventory Service
// Inventory management is now handled by the Inventory Service via events
export const reserveInventory = async (req: Request, res: Response) => {
  logger.warn('Deprecated endpoint called: reserveInventory', { 
    productId: req.params.id,
    ip: req.ip 
  });
  
  res.status(410).json(error(
    'ENDPOINT_DEPRECATED', 
    'This endpoint is deprecated. Inventory management is now handled by the Inventory Service.'
  ));
};

export const releaseInventory = async (req: Request, res: Response) => {
  logger.warn('Deprecated endpoint called: releaseInventory', { 
    productId: req.params.id,
    ip: req.ip 
  });
  
  res.status(410).json(error(
    'ENDPOINT_DEPRECATED', 
    'This endpoint is deprecated. Inventory management is now handled by the Inventory Service.'
  ));
};
