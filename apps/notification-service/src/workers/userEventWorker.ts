import { Worker, QueueEvents } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, UserRegisteredData, NotificationJob, JOB_TYPES } from '@repo/shared';
import { notificationQueue } from './notificationWorker';
import { renderWelcomeEmail } from '../services/templateService';

// Create the worker for user events
const userEventsWorker = new Worker('user.events', async (job) => {
  const event = job.data as DomainEvent<UserRegisteredData>;
  
  logger.info('Processing user event', { 
    jobId: job.id, 
    eventId: event.eventId,
    eventType: event.eventType,
    userId: event.aggregateId 
  });

  // Idempotency check
  const processed = await idempotencyGuard.isProcessed(event.eventId);
  if (processed) {
    logger.info('User event already processed, skipping', { 
      eventId: event.eventId,
      jobId: job.id 
    });
    return { status: 'duplicate', eventId: event.eventId };
  }

  try {
    switch (event.eventType) {
      case EventTypes.USER_REGISTERED:
        await handleUserRegistered(event.data as UserRegisteredData, event);
        break;

      case EventTypes.USER_UPDATED:
        await handleUserUpdated(event.data, event);
        break;

      case EventTypes.USER_DELETED:
        await handleUserDeleted(event.data, event);
        break;

      case EventTypes.PASSWORD_RESET_REQUESTED:
        await handlePasswordResetRequested(event.data, event);
        break;

      default:
        logger.warn('Unknown user event type', { eventType: event.eventType });
        return { status: 'ignored', eventId: event.eventId };
    }

    // Mark as processed
    await idempotencyGuard.markAsProcessed(event.eventId, { status: 'success' });

    logger.info('User event processed successfully', { 
      jobId: job.id, 
      eventId: event.eventId,
      eventType: event.eventType,
      userId: event.aggregateId 
    });

    return { status: 'success', eventId: event.eventId };

  } catch (error) {
    logger.error('User event processing failed', { 
      jobId: job.id, 
      eventId: event.eventId,
      eventType: event.eventType,
      userId: event.aggregateId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
});

/**
 * Handle user registered event
 * Creates a welcome email notification task
 */
async function handleUserRegistered(userData: UserRegisteredData, event: DomainEvent<UserRegisteredData>): Promise<void> {
  logger.info('Handling user registered', { userId: userData.userId, email: userData.email });

  // Create welcome email notification task
  const welcomeEmailData = {
    userId: userData.userId,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName
  };

  const notificationJob: NotificationJob = {
    type: 'welcome-email',
    data: welcomeEmailData
  };

  // Create notification event
  const notificationEvent: DomainEvent<NotificationJob> = {
    eventId: crypto.randomUUID(),
    eventType: EventTypes.NOTIFICATION_SENT,
    aggregateId: userData.userId,
    aggregateType: 'User',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: event.correlationId,
    causationId: event.eventId,
    data: notificationJob,
    metadata: {
      source: 'notification-service',
      environment: process.env.NODE_ENV || 'development',
      userId: userData.userId
    }
  };

  // Add to notification tasks queue
  await notificationQueue.add('welcome-email', notificationEvent, {
    priority: 2, // Higher priority for welcome emails
    delay: 0
  });

  logger.info('Welcome email notification queued', {
    userId: userData.userId,
    email: userData.email,
    notificationEventId: notificationEvent.eventId
  });
}

/**
 * Handle user updated event
 * Creates a profile update notification task
 */
async function handleUserUpdated(userData: any, event: DomainEvent<any>): Promise<void> {
  logger.info('Handling user updated', { userId: userData.userId });

  // Create profile update notification task
  const updateEmailData = {
    userId: userData.userId,
    email: userData.email || 'user@example.com', // Fallback email
    updatedFields: userData.updatedFields
  };

  const notificationJob: NotificationJob = {
    type: 'profile-update-email',
    data: updateEmailData
  };

  // Create notification event
  const notificationEvent: DomainEvent<NotificationJob> = {
    eventId: crypto.randomUUID(),
    eventType: EventTypes.NOTIFICATION_SENT,
    aggregateId: userData.userId,
    aggregateType: 'User',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: event.correlationId,
    causationId: event.eventId,
    data: notificationJob,
    metadata: {
      source: 'notification-service',
      environment: process.env.NODE_ENV || 'development',
      userId: userData.userId
    }
  };

  // Add to notification tasks queue
  await notificationQueue.add('profile-update-email', notificationEvent, {
    priority: 1,
    delay: 0
  });

  logger.info('Profile update notification queued', {
    userId: userData.userId,
    notificationEventId: notificationEvent.eventId
  });
}

/**
 * Handle user deleted event
 * Creates an account deletion notification task
 */
async function handleUserDeleted(userData: any, event: DomainEvent<any>): Promise<void> {
  logger.info('Handling user deleted', { userId: userData.userId });

  // Create account deletion notification task
  const deletionEmailData = {
    userId: userData.userId,
    email: userData.email || 'user@example.com', // Fallback email
    deletionDate: new Date().toISOString()
  };

  const notificationJob: NotificationJob = {
    type: 'account-deletion-email',
    data: deletionEmailData
  };

  // Create notification event
  const notificationEvent: DomainEvent<NotificationJob> = {
    eventId: crypto.randomUUID(),
    eventType: EventTypes.NOTIFICATION_SENT,
    aggregateId: userData.userId,
    aggregateType: 'User',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: event.correlationId,
    causationId: event.eventId,
    data: notificationJob,
    metadata: {
      source: 'notification-service',
      environment: process.env.NODE_ENV || 'development',
      userId: userData.userId
    }
  };

  // Add to notification tasks queue
  await notificationQueue.add('account-deletion-email', notificationEvent, {
    priority: 1,
    delay: 0
  });

  logger.info('Account deletion notification queued', {
    userId: userData.userId,
    notificationEventId: notificationEvent.eventId
  });
}

/**
 * Handle password reset requested event
 * Creates a password reset email notification task
 */
async function handlePasswordResetRequested(userData: any, event: DomainEvent<any>): Promise<void> {
  logger.info('Handling password reset requested', { userId: userData.userId, email: userData.email });

  // Create password reset notification task
  const resetEmailData = {
    userId: userData.userId,
    email: userData.email,
    resetToken: userData.resetToken,
    resetUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${userData.resetToken}`
  };

  const notificationJob: NotificationJob = {
    type: 'password-reset-email',
    data: resetEmailData
  };

  // Create notification event
  const notificationEvent: DomainEvent<NotificationJob> = {
    eventId: crypto.randomUUID(),
    eventType: EventTypes.NOTIFICATION_SENT,
    aggregateId: userData.userId,
    aggregateType: 'User',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: event.correlationId,
    causationId: event.eventId,
    data: notificationJob,
    metadata: {
      source: 'notification-service',
      environment: process.env.NODE_ENV || 'development',
      userId: userData.userId
    }
  };

  // Add to notification tasks queue
  await notificationQueue.add('password-reset-email', notificationEvent, {
    priority: 2, // Higher priority for password reset
    delay: 0
  });

  logger.info('Password reset notification queued', {
    userId: userData.userId,
    email: userData.email,
    notificationEventId: notificationEvent.eventId
  });
}

// Queue events for monitoring
const queueEvents = new QueueEvents('user.events', {
  connection: redisConnection
});

// Event handlers
userEventsWorker.on('completed', (job, result) => {
  logger.info('User event job completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    eventType: job.data?.eventType,
    duration: Date.now() - job.timestamp,
    result
  });
});

userEventsWorker.on('failed', (job, error) => {
  logger.error('User event job failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    eventType: job?.data?.eventType,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
});

userEventsWorker.on('stalled', (jobId) => {
  logger.warn('User event job stalled', { jobId });
});

userEventsWorker.on('error', (error) => {
  logger.error('User events worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down user events worker gracefully...');
  
  try {
    await userEventsWorker.close();
    await queueEvents.close();
    logger.info('User events worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during user events worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { userEventsWorker };
