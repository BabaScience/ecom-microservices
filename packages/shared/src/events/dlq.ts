import { Queue, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { logger } from '../utils/logger';

// Initialize Dead Letter Queue
const dlq = new Queue('dead-letter-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false, // Keep all DLQ jobs for analysis
    removeOnFail: false
  }
});

export interface DLQJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: any;
  failureReason: string;
  failureCount: number;
  lastError: string;
  timestamp: string;
  metadata: {
    service: string;
    environment: string;
    correlationId?: string;
  };
}

export class DLQPublisher {
  /**
   * Move a failed job to the Dead Letter Queue
   */
  static async moveToDLQ(
    originalQueue: string,
    originalJobId: string,
    originalData: any,
    failureReason: string,
    lastError: string,
    metadata: {
      service: string;
      environment: string;
      correlationId?: string;
    }
  ): Promise<void> {
    try {
      const dlqData: DLQJobData = {
        originalQueue,
        originalJobId,
        originalData,
        failureReason,
        failureCount: originalData?.attemptsMade || 1,
        lastError,
        timestamp: new Date().toISOString(),
        metadata
      };

      await dlq.add('failed-job', dlqData, {
        priority: this.getPriorityFromError(lastError),
        delay: 0
      });

      logger.error('Job moved to DLQ', {
        originalQueue,
        originalJobId,
        failureReason,
        lastError,
        service: metadata.service
      });
    } catch (error) {
      logger.error('Failed to move job to DLQ', {
        originalQueue,
        originalJobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Retry a job from DLQ
   */
  static async retryFromDLQ(dlqJobId: string): Promise<void> {
    try {
      const dlqJob = await dlq.getJob(dlqJobId);
      if (!dlqJob) {
        throw new Error(`DLQ job ${dlqJobId} not found`);
      }

      const dlqData = dlqJob.data as DLQJobData;
      
      // Create new job in original queue
      const originalQueue = new Queue(dlqData.originalQueue, {
        connection: redisConnection
      });

      await originalQueue.add(dlqData.originalData.name || 'retry-job', dlqData.originalData.data, {
        attempts: 1, // Reset attempts for retry
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      // Remove from DLQ
      await dlqJob.remove();

      logger.info('Job retried from DLQ', {
        dlqJobId,
        originalQueue: dlqData.originalQueue,
        originalJobId: dlqData.originalJobId
      });

      await originalQueue.close();
    } catch (error) {
      logger.error('Failed to retry job from DLQ', {
        dlqJobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get DLQ statistics
   */
  static async getDLQStats(): Promise<{
    total: number;
    byService: Record<string, number>;
    byQueue: Record<string, number>;
    byError: Record<string, number>;
    recentFailures: DLQJobData[];
  }> {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        dlq.getWaitingCount(),
        dlq.getActiveCount(),
        dlq.getCompletedCount(),
        dlq.getFailedCount()
      ]);

      const total = waiting + active + completed + failed;

      // Get recent failures (last 10)
      const recentJobs = await dlq.getJobs(['waiting', 'active', 'completed', 'failed'], 0, 10);
      const recentFailures: DLQJobData[] = recentJobs
        .map(job => job.data as DLQJobData)
        .filter(data => data !== null);

      // Aggregate statistics
      const byService: Record<string, number> = {};
      const byQueue: Record<string, number> = {};
      const byError: Record<string, number> = {};

      recentFailures.forEach(job => {
        byService[job.metadata.service] = (byService[job.metadata.service] || 0) + 1;
        byQueue[job.originalQueue] = (byQueue[job.originalQueue] || 0) + 1;
        byError[job.failureReason] = (byError[job.failureReason] || 0) + 1;
      });

      return {
        total,
        byService,
        byQueue,
        byError,
        recentFailures
      };
    } catch (error) {
      logger.error('Failed to get DLQ stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Categorize error and determine priority
   */
  private static getPriorityFromError(error: string): number {
    const lowerError = error.toLowerCase();
    
    // Critical errors (priority 1)
    if (lowerError.includes('database') || 
        lowerError.includes('connection') || 
        lowerError.includes('timeout')) {
      return 1;
    }
    
    // High priority errors (priority 2)
    if (lowerError.includes('validation') || 
        lowerError.includes('not found') || 
        lowerError.includes('unauthorized')) {
      return 2;
    }
    
    // Medium priority errors (priority 3)
    if (lowerError.includes('rate limit') || 
        lowerError.includes('temporary') || 
        lowerError.includes('retry')) {
      return 3;
    }
    
    // Low priority errors (priority 4)
    return 4;
  }

  /**
   * Check if error is transient (can be retried) or permanent
   */
  static isTransientError(error: string): boolean {
    const lowerError = error.toLowerCase();
    
    // Permanent errors
    const permanentErrors = [
      'not found',
      'unauthorized',
      'forbidden',
      'validation',
      'invalid',
      'malformed',
      'duplicate'
    ];
    
    if (permanentErrors.some(permanent => lowerError.includes(permanent))) {
      return false;
    }
    
    // Transient errors
    const transientErrors = [
      'timeout',
      'connection',
      'network',
      'temporary',
      'rate limit',
      'service unavailable',
      'database',
      'redis'
    ];
    
    return transientErrors.some(transient => lowerError.includes(transient));
  }

  /**
   * Close DLQ connection
   */
  static async close(): Promise<void> {
    await dlq.close();
  }
}

export { dlq };
