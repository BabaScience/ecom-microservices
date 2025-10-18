import { Worker, Queue } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes } from '@repo/shared';
import { sagaOrchestrator } from '../saga/sagaOrchestrator';

// Create the payment events queue
const paymentEventsQueue = new Queue('payment.events', {
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

// Create the worker for payment events
const worker = new Worker('payment.events', async (job) => {
  const event = job.data as DomainEvent<any>;
  
  logger.info('Processing payment event', { 
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
      case EventTypes.PAYMENT_PROCESSED:
        return await handlePaymentProcessed(event);
      
      case EventTypes.PAYMENT_FAILED:
        return await handlePaymentFailed(event);
      
      default:
        logger.info('Ignoring payment event type', { eventType: event.eventType });
        return { status: 'ignored', eventType: event.eventType };
    }
  } catch (error) {
    logger.error('Failed to process payment event', { 
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

async function handlePaymentProcessed(event: DomainEvent<any>) {
  const { orderId } = event.data;
  
  logger.info('Handling payment processed event', { orderId });
  
  // Forward to saga orchestrator
  await sagaOrchestrator.handlePaymentProcessed(orderId);
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

async function handlePaymentFailed(event: DomainEvent<any>) {
  const { orderId, reason } = event.data;
  
  logger.info('Handling payment failed event', { orderId, reason });
  
  // Forward to saga orchestrator
  await sagaOrchestrator.handlePaymentFailed(orderId, reason || 'Payment processing failed');
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(event.eventId, { 
    status: 'success' 
  });
  
  return { status: 'success', eventId: event.eventId };
}

// Event handlers
worker.on('completed', (job, result) => {
  logger.info('Payment event job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Payment event job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Payment event job stalled', { jobId });
});

worker.on('error', (error) => {
  logger.error('Payment event worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down payment event worker gracefully...');
  
  try {
    await worker.close();
    await paymentEventsQueue.close();
    logger.info('Payment event worker shutdown complete');
  } catch (error) {
    logger.error('Error during payment event worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check function
export const getPaymentWorkerHealth = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      paymentEventsQueue.getWaitingCount(),
      paymentEventsQueue.getActiveCount(),
      paymentEventsQueue.getCompletedCount(),
      paymentEventsQueue.getFailedCount()
    ]);
    
    return {
      status: 'healthy',
      service: 'order-service',
      queue: 'payment.events',
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

export { worker, paymentEventsQueue };
