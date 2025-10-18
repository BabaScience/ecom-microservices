import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { redisConnection } from '../config/redis';
import { DomainEvent, EventTypes } from './types';

// Queue configuration by type as specified in the architecture spec
const QUEUE_CONFIGS = {
  // Critical business events - high priority, low latency
  'order.events': {
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential' as const,
        delay: 2000
      },
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: false     // Keep all failed jobs
    },
    limiter: {
      max: 1000,              // Max 1000 jobs
      duration: 1000          // Per second
    }
  },
  
  // Background tasks - lower priority, high throughput
  'notification.tasks': {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: 50        // Keep last 50 failures
    },
    limiter: {
      max: 500,               // Max 500 jobs
      duration: 1000          // Per second
    }
  },
  
  // Critical transactional events - maximum reliability
  'payment.events': {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential' as const,
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: false,
      priority: 1             // Highest priority
    }
  }
};

export class EventPublisher {
  private queues: Map<string, Queue>;
  
  constructor() {
    this.queues = new Map();
  }
  
  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const config = QUEUE_CONFIGS[queueName as keyof typeof QUEUE_CONFIGS] || QUEUE_CONFIGS['notification.tasks'];
      
      const queue = new Queue(queueName, {
        connection: redisConnection,
        ...config
      });
      
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }
  
  async publishEvent<T>(
    queueName: string,
    event: DomainEvent<T>
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    
    await queue.add(
      event.eventType,
      event,
      {
        jobId: event.eventId,  // Deduplicate by event ID
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
    
    console.log(`Published event ${event.eventType} to ${queueName}`);
  }
  
  // Convenience methods for specific event types
  async publishOrderEvent(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('order.events', event);
  }
  
  async publishInventoryEvent(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('inventory.events', event);
  }
  
  async publishNotificationTask(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('notification.tasks', event);
  }
  
  async publishPaymentEvent(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('payment.events', event);
  }
  
  // Helper method to create standardized events
  createEvent<T>(
    eventType: EventTypes,
    aggregateId: string,
    aggregateType: string,
    data: T,
    correlationId?: string,
    causationId?: string | null,
    userId?: string
  ): DomainEvent<T> {
    return {
      eventId: uuidv4(),
      eventType,
      aggregateId,
      aggregateType,
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: correlationId || uuidv4(),
      causationId: causationId || null,
      data,
      metadata: {
        userId,
        source: process.env.SERVICE_NAME || 'unknown-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }
  
  // Close all queues gracefully
  async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    this.queues.clear();
  }
}

// Default publisher instance
export const eventPublisher = new EventPublisher();

// Helper function to get correlation ID from request context
export const getCorrelationId = (): string => {
  // In a real implementation, this would get the correlation ID from request context
  // For now, we'll generate a new one
  return uuidv4();
};
