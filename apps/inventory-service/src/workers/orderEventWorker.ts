import { Worker, QueueEvents } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, OrderCreatedData, OrderCancelledData } from '@repo/shared';
import { inventoryService } from '../services/inventoryService';

// Create the queue with proper configuration
const orderEventsQueue = new Queue('order.events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: false
  },
  limiter: {
    max: 1000,
    duration: 1000
  }
});

// Create the worker with best practices
const worker = new Worker('order.events', async (job) => {
  const event = job.data as DomainEvent<any>;
  
  logger.info('Processing order event', { 
    jobId: job.id, 
    eventId: event.eventId,
    eventType: event.eventType,
    orderId: event.aggregateId 
  });

  // Idempotency check
  const processed = await idempotencyGuard.isProcessed(event.eventId);
  if (processed) {
    logger.info('Event already processed, skipping', { 
      eventId: event.eventId,
      jobId: job.id 
    });
    return { status: 'duplicate', eventId: event.eventId };
  }

  try {
    switch (event.eventType) {
      case EventTypes.ORDER_CREATED:
        return await handleOrderCreated(event as DomainEvent<OrderCreatedData>);
      
      case EventTypes.ORDER_CANCELLED:
        return await handleOrderCancelled(event as DomainEvent<OrderCancelledData>);
      
      default:
        logger.info('Ignoring event type', { eventType: event.eventType });
        return { status: 'ignored', eventType: event.eventType };
    }
  } catch (error) {
    logger.error('Failed to process order event', { 
      jobId: job.id, 
      eventId: event.eventId,
      eventType: event.eventType,
      orderId: event.aggregateId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  
  // Concurrency - number of jobs processed in parallel
  concurrency: 10,
  
  // Rate limiting
  limiter: {
    max: 100,
    duration: 1000
  },
  
  // Automatic job locking - prevents duplicate processing
  lockDuration: 30000,
  
  // Stalled check interval
  stalledInterval: 30000,
  
  // Metrics collection
  metrics: {
    maxDataPoints: 100
  }
});

async function handleOrderCreated(event: DomainEvent<OrderCreatedData>) {
  const { orderId, items } = event.data;
  
  logger.info('Handling order created event', { orderId, itemCount: items.length });
  
  // Reserve inventory for the order
  const result = await inventoryService.reserveInventory({
    orderId,
    items: items.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }))
  });
  
  if (result.success) {
    logger.info('Inventory reservation successful', { 
      orderId, 
      reservedCount: result.reservedItems.length 
    });
  } else {
    logger.warn('Inventory reservation failed', { 
      orderId, 
      failedCount: result.failedItems.length,
      failedItems: result.failedItems
    });
  }
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success', 
    result 
  });
  
  return { status: 'success', eventId: event.eventId, result };
}

async function handleOrderCancelled(event: DomainEvent<OrderCancelledData>) {
  const { orderId } = event.data;
  
  logger.info('Handling order cancelled event', { orderId });
  
  // Release reserved inventory
  await inventoryService.releaseInventory(orderId);
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

// Queue events for monitoring
const queueEvents = new QueueEvents('order.events', {
  connection: redisConnection
});

// Enhanced event handlers with metrics
worker.on('completed', (job, result) => {
  logger.info('Order event job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Order event job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
  
  // Send alert if critical job failed
  if (job?.data?.metadata?.priority === 'critical') {
    logger.error('Critical order event job failed', {
      jobId: job.id,
      eventId: job.data.eventId,
      error: error.message
    });
  }
});

worker.on('stalled', (jobId) => {
  logger.warn('Order event job stalled', { jobId });
});

worker.on('error', (error) => {
  logger.error('Order event worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Queue event listeners
queueEvents.on('waiting', ({ jobId }) => {
  logger.debug('Order event job waiting', { jobId });
});

queueEvents.on('active', ({ jobId }) => {
  logger.debug('Order event job active', { jobId });
});

queueEvents.on('progress', ({ jobId, data }) => {
  logger.debug('Order event job progress', { jobId, progress: data });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down inventory service gracefully...');
  
  try {
    // Close worker (waits for active jobs to complete)
    await worker.close();
    
    // Close queue events
    await queueEvents.close();
    
    logger.info('Inventory service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during inventory service shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check function
export const getWorkerHealth = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      orderEventsQueue.getWaitingCount(),
      orderEventsQueue.getActiveCount(),
      orderEventsQueue.getCompletedCount(),
      orderEventsQueue.getFailedCount()
    ]);
    
    return {
      status: 'healthy',
      service: 'inventory-service',
      queue: 'order.events',
      metrics: {
        waiting,
        active,
        completed,
        failed
      },
      redis: await redisConnection.ping() === 'PONG'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      service: 'inventory-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export { worker, orderEventsQueue };
