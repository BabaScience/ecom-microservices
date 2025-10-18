import express from 'express';
import { correlationId, errorHandler, logger } from '@repo/shared';
import { notificationQueue, worker } from './workers/notificationWorker';

const app = express();
const port = Number(process.env.NOTIFICATION_SERVICE_PORT) || 3004;

// Middleware
app.use(express.json());
app.use(correlationId);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      worker: {
        isRunning: worker.isRunning(),
        concurrency: worker.opts.concurrency
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Optional: Manual notification trigger endpoint (for testing)
app.post('/api/notifications/send', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Type and data are required'
        }
      });
    }

    // Add job to queue
    const job = await notificationQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    logger.info('Manual notification triggered', { 
      jobId: job.id, 
      type, 
      orderId: data.orderId 
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        message: 'Notification job queued successfully'
      }
    });
  } catch (error) {
    logger.error('Failed to queue manual notification', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to queue notification'
      }
    });
  }
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info('Notification Service listening', { 
    port,
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: process.env.REDIS_PORT || 6379
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
