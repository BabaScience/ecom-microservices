import { Queue, Worker, QueueEvents } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, NotificationJob, JOB_TYPES, DLQPublisher } from '@repo/shared';
import { renderOrderConfirmationEmail, renderOrderStatusUpdateEmail, renderWelcomeEmail } from '../services/templateService';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, sendWelcomeEmail } from '../services/emailService';

// Create the queue with proper configuration
const notificationQueue = new Queue('notification.tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: 50        // Keep last 50 failures
  }
});

// Create the worker with best practices
const worker = new Worker('notification.tasks', async (job) => {
  const event = job.data as DomainEvent<NotificationJob>;
  
  logger.info('Processing notification job', { 
    jobId: job.id, 
    eventId: event.eventId,
    eventType: event.eventType,
    jobType: event.data.type
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
    const { type, data } = event.data;
    
    switch (type) {
      case JOB_TYPES.ORDER_CONFIRMATION:
        const confirmationTemplate = renderOrderConfirmationEmail(data);
        await sendOrderConfirmationEmail({
          to: data.email,
          subject: confirmationTemplate.subject,
          html: confirmationTemplate.html,
          text: confirmationTemplate.text
        });
        break;

      case JOB_TYPES.ORDER_STATUS_UPDATE:
        const statusTemplate = renderOrderStatusUpdateEmail(data);
        await sendOrderStatusUpdateEmail({
          to: data.email,
          subject: statusTemplate.subject,
          html: statusTemplate.html,
          text: statusTemplate.text
        });
        break;

      case JOB_TYPES.WELCOME_EMAIL:
        const welcomeTemplate = renderWelcomeEmail(data);
        await sendWelcomeEmail({
          to: data.email,
          subject: welcomeTemplate.subject,
          html: welcomeTemplate.html,
          text: welcomeTemplate.text
        });
        break;

      case JOB_TYPES.PROFILE_UPDATE_EMAIL:
        // TODO: Implement profile update email template
        logger.info('Profile update email not yet implemented', { userId: data.userId });
        break;

      case JOB_TYPES.ACCOUNT_DELETION_EMAIL:
        // TODO: Implement account deletion email template
        logger.info('Account deletion email not yet implemented', { userId: data.userId });
        break;

      case JOB_TYPES.PASSWORD_RESET_EMAIL:
        // TODO: Implement password reset email template
        logger.info('Password reset email not yet implemented', { userId: data.userId });
        break;

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    // Mark as processed
    await idempotencyGuard.markAsProcessed(event.eventId, { status: 'success' });

    logger.info('Notification job completed successfully', { 
      jobId: job.id, 
      eventId: event.eventId,
      type
    });

    return { status: 'success', eventId: event.eventId };

  } catch (error) {
    logger.error('Notification job failed', { 
      jobId: job.id, 
      eventId: event.eventId,
      type: event.data.type,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  
  // Concurrency - number of jobs processed in parallel
  concurrency: 5,
  
  // Rate limiting
  limiter: {
    max: 100,          // Max 100 jobs
    duration: 1000     // Per second
  },
  
  // Automatic job locking - prevents duplicate processing
  lockDuration: 30000, // 30 seconds
  
  // Stalled check interval
  stalledInterval: 30000,
  
  // Metrics collection
  metrics: {
    maxDataPoints: 100
  }
});

// Queue events for monitoring
const queueEvents = new QueueEvents('notification.tasks', {
  connection: redisConnection
});

// Enhanced event handlers with metrics
worker.on('completed', (job, result) => {
  logger.info('Job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

worker.on('failed', async (job, error) => {
  logger.error('Job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
  
  // Move to DLQ if max attempts exceeded
  if (job && job.id && job.attemptsMade >= (job.opts.attempts || 3)) {
    try {
      await DLQPublisher.moveToDLQ(
        'notification.tasks',
        job.id.toString(),
        job.data,
        error.message,
        error.message,
        {
          service: 'notification-service',
          environment: process.env.NODE_ENV || 'development',
          correlationId: job.data?.correlationId
        }
      );
    } catch (dlqError) {
      logger.error('Failed to move job to DLQ', {
        jobId: job.id,
        error: dlqError instanceof Error ? dlqError.message : 'Unknown error'
      });
    }
  }
  
  // Send alert if critical job failed
  if (job?.data?.metadata?.priority === 'critical') {
    logger.error('Critical notification job failed', {
      jobId: job.id,
      eventId: job.data.eventId,
      error: error.message
    });
  }
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

worker.on('error', (error) => {
  logger.error('Worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Queue event listeners
queueEvents.on('waiting', ({ jobId }) => {
  logger.debug('Job waiting', { jobId });
});

queueEvents.on('active', ({ jobId }) => {
  logger.debug('Job active', { jobId });
});

queueEvents.on('progress', ({ jobId, data }) => {
  logger.debug('Job progress', { jobId, progress: data });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down notification worker gracefully...');
  
  try {
    // Close worker (waits for active jobs to complete)
    await worker.close();
    
    // Close queue
    await notificationQueue.close();
    
    // Close queue events
    await queueEvents.close();
    
    logger.info('Notification worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check function
export const getWorkerHealth = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount()
    ]);
    
    return {
      status: 'healthy',
      queue: 'notification.tasks',
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
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export { notificationQueue, worker };
