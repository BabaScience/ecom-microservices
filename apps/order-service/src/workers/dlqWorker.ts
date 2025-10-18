import { Worker, QueueEvents } from 'bullmq';
import { redisConnection, logger } from '@repo/shared';
import { DLQJobData } from '@repo/shared';

// Create DLQ worker for monitoring and alerting
const dlqWorker = new Worker('dead-letter-queue', async (job) => {
  const dlqData = job.data as DLQJobData;
  
  logger.error('DLQ Job Processing', {
    dlqJobId: job.id,
    originalQueue: dlqData.originalQueue,
    originalJobId: dlqData.originalJobId,
    failureReason: dlqData.failureReason,
    failureCount: dlqData.failureCount,
    lastError: dlqData.lastError,
    service: dlqData.metadata.service,
    correlationId: dlqData.metadata.correlationId
  });

  // Send alert for critical failures
  if (dlqData.failureCount >= 3 || dlqData.lastError.toLowerCase().includes('critical')) {
    await sendCriticalAlert(dlqData);
  }

  // Log detailed failure information for debugging
  await logFailureDetails(dlqData);

  return { status: 'processed', dlqJobId: job.id };
}, {
  connection: redisConnection,
  concurrency: 1, // Process DLQ jobs one at a time
  limiter: {
    max: 10,
    duration: 60000 // 1 minute
  }
});

/**
 * Send critical alert for important failures
 */
async function sendCriticalAlert(dlqData: DLQJobData): Promise<void> {
  try {
    // In a real implementation, this would integrate with alerting systems
    // like PagerDuty, Slack, or email notifications
    
    logger.error('CRITICAL ALERT: Job failed multiple times', {
      alertType: 'CRITICAL_FAILURE',
      originalQueue: dlqData.originalQueue,
      originalJobId: dlqData.originalJobId,
      failureReason: dlqData.failureReason,
      failureCount: dlqData.failureCount,
      lastError: dlqData.lastError,
      service: dlqData.metadata.service,
      timestamp: dlqData.timestamp,
      correlationId: dlqData.metadata.correlationId
    });

    // TODO: Integrate with actual alerting service
    // await alertingService.sendCriticalAlert({
    //   title: `Critical Job Failure in ${dlqData.metadata.service}`,
    //   message: `Job ${dlqData.originalJobId} failed ${dlqData.failureCount} times`,
    //   details: dlqData
    // });

  } catch (error) {
    logger.error('Failed to send critical alert', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dlqData
    });
  }
}

/**
 * Log detailed failure information for debugging
 */
async function logFailureDetails(dlqData: DLQJobData): Promise<void> {
  try {
    logger.info('DLQ Failure Details', {
      originalQueue: dlqData.originalQueue,
      originalJobId: dlqData.originalJobId,
      originalData: dlqData.originalData,
      failureReason: dlqData.failureReason,
      failureCount: dlqData.failureCount,
      lastError: dlqData.lastError,
      timestamp: dlqData.timestamp,
      metadata: dlqData.metadata
    });

    // TODO: Store in monitoring system for analysis
    // await monitoringService.storeFailureMetrics(dlqData);

  } catch (error) {
    logger.error('Failed to log failure details', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dlqData
    });
  }
}

// Queue events for monitoring
const queueEvents = new QueueEvents('dead-letter-queue', {
  connection: redisConnection
});

// Event handlers
dlqWorker.on('completed', (job, result) => {
  logger.info('DLQ job processed', { 
    jobId: job.id,
    result
  });
});

dlqWorker.on('failed', (job, error) => {
  logger.error('DLQ worker failed', { 
    jobId: job?.id,
    error: error.message,
    stack: error.stack
  });
});

dlqWorker.on('error', (error) => {
  logger.error('DLQ worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down DLQ worker gracefully...');
  
  try {
    await dlqWorker.close();
    await queueEvents.close();
    logger.info('DLQ worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during DLQ worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { dlqWorker };
