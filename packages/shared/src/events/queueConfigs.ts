import { DefaultJobOptions } from 'bullmq';

// Base configuration for all queues
const baseQueueConfig = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000
  },
  removeOnComplete: 100,
  removeOnFail: 50
};

// Order Events Queue Configuration
export const ORDER_EVENTS_QUEUE_CONFIG = {
  name: 'order.events',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 1
  } as DefaultJobOptions,
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// User Events Queue Configuration
export const USER_EVENTS_QUEUE_CONFIG = {
  name: 'user.events',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 1
  } as DefaultJobOptions,
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Product Events Queue Configuration
export const PRODUCT_EVENTS_QUEUE_CONFIG = {
  name: 'product.events',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 1
  } as DefaultJobOptions,
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Inventory Events Queue Configuration
export const INVENTORY_EVENTS_QUEUE_CONFIG = {
  name: 'inventory.events',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 2, // Higher priority for inventory
    attempts: 5 // More attempts for inventory operations
  } as DefaultJobOptions,
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Notification Tasks Queue Configuration
export const NOTIFICATION_TASKS_QUEUE_CONFIG = {
  name: 'notification.tasks',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 2, // Higher priority for notifications
    attempts: 5 // More attempts for notifications
  } as DefaultJobOptions,
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Payment Events Queue Configuration
export const PAYMENT_EVENTS_QUEUE_CONFIG = {
  name: 'payment.events',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 1, // High priority for payments
    attempts: 5 // More attempts for payment operations
  } as DefaultJobOptions,
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Dead Letter Queue Configuration
export const DLQ_CONFIG = {
  name: 'dead-letter-queue',
  defaultJobOptions: {
    attempts: 1, // Don't retry DLQ jobs
    removeOnComplete: false, // Keep all DLQ jobs for analysis
    removeOnFail: false
  } as DefaultJobOptions,
  concurrency: 1, // Process DLQ jobs one at a time
  limiter: {
    max: 10,
    duration: 60000 // 1 minute
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Email Tasks Queue Configuration
export const EMAIL_TASKS_QUEUE_CONFIG = {
  name: 'email.tasks',
  defaultJobOptions: {
    ...baseQueueConfig,
    priority: 2, // Higher priority for emails
    attempts: 5 // More attempts for email operations
  } as DefaultJobOptions,
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000
};

// Queue configurations map for easy access
export const QUEUE_CONFIGS = {
  ORDER_EVENTS: ORDER_EVENTS_QUEUE_CONFIG,
  USER_EVENTS: USER_EVENTS_QUEUE_CONFIG,
  PRODUCT_EVENTS: PRODUCT_EVENTS_QUEUE_CONFIG,
  INVENTORY_EVENTS: INVENTORY_EVENTS_QUEUE_CONFIG,
  NOTIFICATION_TASKS: NOTIFICATION_TASKS_QUEUE_CONFIG,
  PAYMENT_EVENTS: PAYMENT_EVENTS_QUEUE_CONFIG,
  DLQ: DLQ_CONFIG,
  EMAIL_TASKS: EMAIL_TASKS_QUEUE_CONFIG
} as const;

// Helper function to get queue config by name
export function getQueueConfig(queueName: string) {
  const configMap: Record<string, any> = {
    'order.events': ORDER_EVENTS_QUEUE_CONFIG,
    'user.events': USER_EVENTS_QUEUE_CONFIG,
    'product.events': PRODUCT_EVENTS_QUEUE_CONFIG,
    'inventory.events': INVENTORY_EVENTS_QUEUE_CONFIG,
    'notification.tasks': NOTIFICATION_TASKS_QUEUE_CONFIG,
    'payment.events': PAYMENT_EVENTS_QUEUE_CONFIG,
    'dead-letter-queue': DLQ_CONFIG,
    'email.tasks': EMAIL_TASKS_QUEUE_CONFIG
  };

  return configMap[queueName] || baseQueueConfig;
}
