import { Worker, QueueEvents } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, InventoryReservedData, InventoryReleasedData, InventoryInsufficientData } from '@repo/shared';
import { Product } from '../models/Product';

// Create the worker for inventory events
const inventoryWorker = new Worker('inventory.events', async (job) => {
  const event = job.data as DomainEvent<InventoryReservedData | InventoryReleasedData | InventoryInsufficientData>;
  
  logger.info('Processing inventory event', { 
    jobId: job.id, 
    eventId: event.eventId,
    eventType: event.eventType,
    orderId: event.data.orderId 
  });

  // Idempotency check
  const processed = await idempotencyGuard.isProcessed(event.eventId);
  if (processed) {
    logger.info('Inventory event already processed, skipping', { 
      eventId: event.eventId,
      jobId: job.id 
    });
    return { status: 'duplicate', eventId: event.eventId };
  }

  try {
    switch (event.eventType) {
      case EventTypes.INVENTORY_RESERVED:
        await handleInventoryReserved(event.data as InventoryReservedData);
        break;

      case EventTypes.INVENTORY_RELEASED:
        await handleInventoryReleased(event.data as InventoryReleasedData);
        break;

      case EventTypes.INVENTORY_INSUFFICIENT:
        await handleInventoryInsufficient(event.data as InventoryInsufficientData);
        break;

      default:
        logger.warn('Unknown inventory event type', { eventType: event.eventType });
        return { status: 'ignored', eventId: event.eventId };
    }

    // Mark as processed
    await idempotencyGuard.markAsProcessed(event.eventId, { status: 'success' });

    logger.info('Inventory event processed successfully', { 
      jobId: job.id, 
      eventId: event.eventId,
      eventType: event.eventType,
      orderId: event.data.orderId 
    });

    return { status: 'success', eventId: event.eventId };

  } catch (error) {
    logger.error('Inventory event processing failed', { 
      jobId: job.id, 
      eventId: event.eventId,
      eventType: event.eventType,
      orderId: event.data.orderId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 5,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
});

/**
 * Handle inventory reserved event
 * Updates product reserved count
 */
async function handleInventoryReserved(data: InventoryReservedData): Promise<void> {
  logger.info('Handling inventory reserved', { orderId: data.orderId, items: data.items });

  for (const item of data.items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      logger.error('Product not found for inventory reservation', { 
        productId: item.productId, 
        orderId: data.orderId 
      });
      continue;
    }

    // Update reserved quantity
    product.inventory.reserved += item.quantity;
    await product.save();

    logger.info('Product inventory reserved', {
      productId: product._id,
      sku: product.sku,
      reservedQuantity: item.quantity,
      totalReserved: product.inventory.reserved,
      available: product.inventory.quantity - product.inventory.reserved
    });
  }
}

/**
 * Handle inventory released event
 * Restores available inventory by reducing reserved count
 */
async function handleInventoryReleased(data: InventoryReleasedData): Promise<void> {
  logger.info('Handling inventory released', { orderId: data.orderId, items: data.items });

  for (const item of data.items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      logger.error('Product not found for inventory release', { 
        productId: item.productId, 
        orderId: data.orderId 
      });
      continue;
    }

    // Ensure we don't release more than reserved
    const releaseQuantity = Math.min(item.quantity, product.inventory.reserved);
    product.inventory.reserved -= releaseQuantity;
    await product.save();

    logger.info('Product inventory released', {
      productId: product._id,
      sku: product.sku,
      releasedQuantity: releaseQuantity,
      totalReserved: product.inventory.reserved,
      available: product.inventory.quantity - product.inventory.reserved
    });
  }
}

/**
 * Handle inventory insufficient event
 * Logs the failure for monitoring purposes
 */
async function handleInventoryInsufficient(data: InventoryInsufficientData): Promise<void> {
  logger.warn('Handling inventory insufficient', { 
    orderId: data.orderId, 
    failedItems: data.failedItems 
  });

  // Log each failed item for monitoring
  for (const failedItem of data.failedItems) {
    const product = await Product.findById(failedItem.productId);
    if (product) {
      logger.warn('Inventory insufficient for product', {
        productId: product._id,
        sku: product.sku,
        reason: failedItem.reason,
        available: product.inventory.quantity - product.inventory.reserved,
        reserved: product.inventory.reserved
      });
    }
  }
}

// Queue events for monitoring
const queueEvents = new QueueEvents('inventory.events', {
  connection: redisConnection
});

// Event handlers
inventoryWorker.on('completed', (job, result) => {
  logger.info('Inventory job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

inventoryWorker.on('failed', (job, error) => {
  logger.error('Inventory job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
});

inventoryWorker.on('stalled', (jobId) => {
  logger.warn('Inventory job stalled', { jobId });
});

inventoryWorker.on('error', (error) => {
  logger.error('Inventory worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down inventory worker gracefully...');
  
  try {
    await inventoryWorker.close();
    await queueEvents.close();
    logger.info('Inventory worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during inventory worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { inventoryWorker };
