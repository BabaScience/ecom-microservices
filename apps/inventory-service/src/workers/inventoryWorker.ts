import { Worker, Queue } from 'bullmq';
import { logger, redisConnection } from '@repo/shared';
import { inventoryService } from '../services/inventoryService';

// Create the inventory queue for scheduled tasks
const inventoryQueue = new Queue('inventory.tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: 50
  }
});

// Create the worker for inventory maintenance tasks
const worker = new Worker('inventory.tasks', async (job) => {
  logger.info('Processing inventory task', { 
    jobId: job.id, 
    jobName: job.name,
    data: job.data
  });

  try {
    switch (job.name) {
      case 'expire-reservations':
        await inventoryService.expireReservations();
        break;
      
      case 'cleanup-expired-reservations':
        await cleanupExpiredReservations();
        break;
      
      default:
        logger.warn('Unknown inventory task', { jobName: job.name });
        return { status: 'ignored', jobName: job.name };
    }
    
    logger.info('Inventory task completed', { 
      jobId: job.id, 
      jobName: job.name 
    });
    
    return { status: 'success', jobName: job.name };
  } catch (error) {
    logger.error('Inventory task failed', { 
      jobId: job.id, 
      jobName: job.name,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 3,
  limiter: {
    max: 10,
    duration: 1000
  }
});

async function cleanupExpiredReservations() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep for 7 days
  
  // This would be implemented with a proper cleanup mechanism
  logger.info('Cleaning up expired reservations older than 7 days', { cutoffDate });
}

// Schedule periodic tasks
async function schedulePeriodicTasks() {
  // Schedule reservation expiration check every 5 minutes
  await inventoryQueue.add(
    'expire-reservations',
    {},
    {
      repeat: {
        pattern: '*/5 * * * *' // Every 5 minutes
      },
      removeOnComplete: 10,
      removeOnFail: 5
    }
  );
  
  // Schedule cleanup task daily at 2 AM
  await inventoryQueue.add(
    'cleanup-expired-reservations',
    {},
    {
      repeat: {
        pattern: '0 2 * * *' // Daily at 2 AM
      },
      removeOnComplete: 7,
      removeOnFail: 3
    }
  );
  
  logger.info('Scheduled periodic inventory tasks');
}

// Event handlers
worker.on('completed', (job, result) => {
  logger.info('Inventory task completed', { 
    jobId: job.id, 
    jobName: job.name,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Inventory task failed', { 
    jobId: job?.id, 
    jobName: job?.name,
    error: error.message,
    attempts: job?.attemptsMade
  });
});

worker.on('error', (error) => {
  logger.error('Inventory worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down inventory worker gracefully...');
  
  try {
    await worker.close();
    await inventoryQueue.close();
    logger.info('Inventory worker shutdown complete');
  } catch (error) {
    logger.error('Error during inventory worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize periodic tasks
schedulePeriodicTasks().catch(error => {
  logger.error('Failed to schedule periodic tasks', { 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
});

export { worker, inventoryQueue };
