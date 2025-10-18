import { Worker, Queue } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, InventoryReservedData, InventoryInsufficientData } from '@repo/shared';
import { sagaOrchestrator } from '../saga/sagaOrchestrator';

// Create the inventory events queue
const inventoryEventsQueue = new Queue('inventory.events', {
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

// Create the worker for inventory events
const worker = new Worker('inventory.events', async (job) => {
  const event = job.data as DomainEvent<any>;
  
  logger.info('Processing inventory event', { 
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
      case EventTypes.INVENTORY_RESERVED:
        return await handleInventoryReserved(event as DomainEvent<InventoryReservedData>);
      
      case EventTypes.INVENTORY_INSUFFICIENT:
        return await handleInventoryInsufficient(event as DomainEvent<InventoryInsufficientData>);
      
      case EventTypes.INVENTORY_RELEASED:
        return await handleInventoryReleased(event);
      
      default:
        logger.info('Ignoring inventory event type', { eventType: event.eventType });
        return { status: 'ignored', eventType: event.eventType };
    }
  } catch (error) {
    logger.error('Failed to process inventory event', { 
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
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000,
  metrics: {
    maxDataPoints: 100
  }
});

async function handleInventoryReserved(event: DomainEvent<InventoryReservedData>) {
  const { orderId } = event.data;
  
  logger.info('Handling inventory reserved event', { orderId });
  
  // Forward to saga orchestrator
  await sagaOrchestrator.handleInventoryReserved(orderId);
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

async function handleInventoryInsufficient(event: DomainEvent<InventoryInsufficientData>) {
  const { orderId, failedItems } = event.data;
  
  logger.info('Handling inventory insufficient event', { 
    orderId, 
    failedCount: failedItems.length 
  });
  
  const reason = failedItems.map(item => `${item.productId}: ${item.reason}`).join(', ');
  
  // Forward to saga orchestrator
  await sagaOrchestrator.handleInventoryInsufficient(orderId, reason);
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

async function handleInventoryReleased(event: DomainEvent<any>) {
  const { orderId } = event.data;
  
  logger.info('Handling inventory released event', { orderId });
  
  // This is typically handled during order cancellation
  // No specific action needed for saga progression
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

// Event handlers
worker.on('completed', (job, result) => {
  logger.info('Inventory event job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Inventory event job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Inventory event job stalled', { jobId });
});

worker.on('error', (error) => {
  logger.error('Inventory event worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down inventory event worker gracefully...');
  
  try {
    await worker.close();
    await inventoryEventsQueue.close();
    logger.info('Inventory event worker shutdown complete');
  } catch (error) {
    logger.error('Error during inventory event worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check function
export const getInventoryWorkerHealth = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      inventoryEventsQueue.getWaitingCount(),
      inventoryEventsQueue.getActiveCount(),
      inventoryEventsQueue.getCompletedCount(),
      inventoryEventsQueue.getFailedCount()
    ]);
    
    return {
      status: 'healthy',
      service: 'order-service',
      queue: 'inventory.events',
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
      service: 'order-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export { worker, inventoryEventsQueue };
