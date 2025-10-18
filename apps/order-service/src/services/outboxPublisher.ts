import { Queue } from 'bullmq';
import { logger } from '@repo/shared';
import { Outbox, IOutbox } from '../models/Outbox';
import { eventPublisher, DomainEvent } from '@repo/shared';

export class OutboxPublisher {
  private queue: Queue;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  
  constructor(queue: Queue) {
    this.queue = queue;
  }
  
  // Save event to outbox within transaction
  async saveEvent(
    session: any, // MongoDB session
    event: DomainEvent<any>
  ): Promise<void> {
    const outboxEvent = new Outbox({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventData: event,
      published: false,
      publishedAt: null,
      retryCount: 0
    });
    
    await outboxEvent.save({ session });
    logger.debug('Event saved to outbox', { eventId: event.eventId });
  }
  
  // Start background publisher
  startPublisher(): void {
    if (this.isRunning) {
      logger.warn('Outbox publisher is already running');
      return;
    }
    
    this.isRunning = true;
    logger.info('Starting outbox publisher');
    
    // Poll every 5 seconds
    this.pollInterval = setInterval(async () => {
      await this.publishUnpublishedEvents();
    }, 5000);
  }
  
  // Stop background publisher
  stopPublisher(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    logger.info('Outbox publisher stopped');
  }
  
  // Publish unpublished events
  private async publishUnpublishedEvents(): Promise<void> {
    try {
      // Find unpublished events (with limit and retry count)
      const events = await Outbox.find({ 
        published: false,
        retryCount: { $lt: 5 }
      })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
      
      if (events.length === 0) {
        return;
      }
      
      logger.debug(`Found ${events.length} unpublished events to process`);
      
      for (const outboxEvent of events) {
        try {
          await this.publishEvent(outboxEvent);
        } catch (error) {
          logger.error('Failed to publish outbox event', {
            eventId: outboxEvent.eventId,
            error: error.message,
            retryCount: outboxEvent.retryCount
          });
          
          // Increment retry count
          await Outbox.findByIdAndUpdate(outboxEvent._id, {
            $inc: { retryCount: 1 }
          });
        }
      }
    } catch (error) {
      logger.error('Outbox publisher error', { error: error.message });
    }
  }
  
  // Publish individual event
  private async publishEvent(outboxEvent: IOutbox): Promise<void> {
    const event = outboxEvent.eventData as DomainEvent<any>;
    
    // Determine queue name based on event type
    const queueName = this.getQueueName(event.eventType);
    
    // Publish to BullMQ
    await this.queue.add(
      event.eventType,
      event,
      {
        jobId: event.eventId,  // Deduplicate on BullMQ side
        removeOnComplete: true
      }
    );
    
    // Mark as published
    await Outbox.findByIdAndUpdate(outboxEvent._id, {
      $set: {
        published: true,
        publishedAt: new Date(),
        processedAt: new Date()
      }
    });
    
    logger.info('Published outbox event', { 
      eventId: event.eventId,
      eventType: event.eventType,
      queueName 
    });
  }
  
  // Determine queue name based on event type
  private getQueueName(eventType: string): string {
    if (eventType.startsWith('order.')) {
      return 'order.events';
    } else if (eventType.startsWith('user.')) {
      return 'user.events';
    } else if (eventType.startsWith('inventory.')) {
      return 'inventory.events';
    } else if (eventType.startsWith('payment.')) {
      return 'payment.events';
    } else if (eventType.startsWith('notification.')) {
      return 'notification.tasks';
    } else {
      return 'default.events';
    }
  }
  
  // Get outbox statistics
  async getStats(): Promise<{
    total: number;
    published: number;
    unpublished: number;
    failed: number;
  }> {
    const [total, published, unpublished, failed] = await Promise.all([
      Outbox.countDocuments(),
      Outbox.countDocuments({ published: true }),
      Outbox.countDocuments({ published: false, retryCount: { $lt: 5 } }),
      Outbox.countDocuments({ retryCount: { $gte: 5 } })
    ]);
    
    return {
      total,
      published,
      unpublished,
      failed
    };
  }
  
  // Clean up old published events (optional)
  async cleanupOldEvents(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await Outbox.deleteMany({
      published: true,
      publishedAt: { $lt: cutoffDate }
    });
    
    logger.info('Cleaned up old outbox events', { 
      deletedCount: result.deletedCount,
      daysOld 
    });
    
    return result.deletedCount || 0;
  }
}
