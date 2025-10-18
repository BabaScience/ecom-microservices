import { Queue } from 'bullmq';
import { redisConnection, logger, EventTypes, DomainEvent, UserRegisteredData } from '@repo/shared';

// Initialize user events queue
const userEventsQueue = new Queue('user.events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

export class UserEventPublisher {
  /**
   * Publish user registered event
   */
  static async publishUserRegistered(
    userId: string,
    userData: {
      email: string;
      firstName: string;
      lastName: string;
    },
    correlationId?: string
  ): Promise<void> {
    try {
      const eventData: UserRegisteredData = {
        userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName
      };

      const event: DomainEvent<UserRegisteredData> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.USER_REGISTERED,
        aggregateId: userId,
        aggregateType: 'User',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: eventData,
        metadata: {
          source: 'user-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await userEventsQueue.add(EventTypes.USER_REGISTERED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('User registered event published', {
        eventId: event.eventId,
        userId,
        email: userData.email
      });
    } catch (error) {
      logger.error('Failed to publish user registered event', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish user updated event
   */
  static async publishUserUpdated(
    userId: string,
    updatedFields: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{ userId: string; updatedFields: Record<string, any> }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.USER_UPDATED,
        aggregateId: userId,
        aggregateType: 'User',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          userId,
          updatedFields
        },
        metadata: {
          source: 'user-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await userEventsQueue.add(EventTypes.USER_UPDATED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('User updated event published', {
        eventId: event.eventId,
        userId,
        updatedFields: Object.keys(updatedFields)
      });
    } catch (error) {
      logger.error('Failed to publish user updated event', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish user deleted event
   */
  static async publishUserDeleted(
    userId: string,
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{ userId: string }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.USER_DELETED,
        aggregateId: userId,
        aggregateType: 'User',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          userId
        },
        metadata: {
          source: 'user-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await userEventsQueue.add(EventTypes.USER_DELETED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('User deleted event published', {
        eventId: event.eventId,
        userId
      });
    } catch (error) {
      logger.error('Failed to publish user deleted event', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish password reset requested event
   */
  static async publishPasswordResetRequested(
    userId: string,
    email: string,
    resetToken: string,
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{ userId: string; email: string; resetToken: string }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.PASSWORD_RESET_REQUESTED,
        aggregateId: userId,
        aggregateType: 'User',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          userId,
          email,
          resetToken
        },
        metadata: {
          source: 'user-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await userEventsQueue.add(EventTypes.PASSWORD_RESET_REQUESTED, event, {
        priority: 2, // Higher priority for password reset
        delay: 0
      });

      logger.info('Password reset requested event published', {
        eventId: event.eventId,
        userId,
        email
      });
    } catch (error) {
      logger.error('Failed to publish password reset requested event', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Close the queue connection
   */
  static async close(): Promise<void> {
    await userEventsQueue.close();
  }
}

export { userEventsQueue };
