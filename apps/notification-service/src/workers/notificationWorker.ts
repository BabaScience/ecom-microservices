import { Queue, Worker } from 'bullmq';
import { logger } from '@repo/shared';
import { NotificationJob, JOB_TYPES } from '../types/notifications';
import { renderOrderConfirmationEmail, renderOrderStatusUpdateEmail } from '../services/templateService';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/emailService';

// Create the queue
const notificationQueue = new Queue('notifications', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379
  }
});

// Create the worker
const worker = new Worker('notifications', async (job) => {
  const { type, data } = job.data as NotificationJob;
  
  logger.info('Processing notification job', { 
    jobId: job.id, 
    type, 
    orderId: data.orderId 
  });

  try {
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

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    logger.info('Notification job completed successfully', { 
      jobId: job.id, 
      type, 
      orderId: data.orderId 
    });

  } catch (error) {
    logger.error('Notification job failed', { 
      jobId: job.id, 
      type, 
      orderId: data.orderId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379
  },
  concurrency: 3,
  removeOnComplete: 10,
  removeOnFail: 5
});

// Event handlers
worker.on('completed', (job) => {
  logger.info('Job completed', { 
    jobId: job?.id, 
    type: job?.data?.type,
    duration: job ? Date.now() - job.timestamp : 0
  });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { 
    jobId: job?.id, 
    type: job?.data?.type,
    error: err.message,
    attempts: job?.attemptsMade 
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message });
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down notification worker...');
  await worker.close();
  await notificationQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down notification worker...');
  await worker.close();
  await notificationQueue.close();
  process.exit(0);
});

export { notificationQueue, worker };
