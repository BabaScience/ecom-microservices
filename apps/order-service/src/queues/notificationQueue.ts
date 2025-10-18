import { Queue } from 'bullmq';
import { redisConnection, eventPublisher, EventTypes, DomainEvent, OrderCreatedData, NotificationJob, JOB_TYPES } from '@repo/shared';

// Create the queue with proper BullMQ configuration
const notificationQueue = new Queue('notification.tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: 50
  },
  limiter: {
    max: 500,
    duration: 1000
  }
});

export async function enqueueOrderConfirmation(orderData: {
  orderId: string;
  userId: string;
  email: string;
  orderDetails: {
    orderNumber: string;
    total: number;
    items: any[];
  };
}) {
  // Create notification task data
  const notificationData: NotificationJob = {
    type: JOB_TYPES.ORDER_CONFIRMATION,
    data: {
      orderId: orderData.orderId,
      email: orderData.email,
      orderNumber: orderData.orderDetails.orderNumber,
      total: orderData.orderDetails.total,
      items: orderData.orderDetails.items,
      userId: orderData.userId
    }
  };

  // Create standardized domain event
  const event = eventPublisher.createEvent(
    EventTypes.NOTIFICATION_SENT,
    orderData.orderId,
    'Order',
    notificationData,
    undefined, // correlationId will be generated
    undefined, // causationId
    orderData.userId
  );

  // Publish event to notification queue
  await eventPublisher.publishNotificationTask(event);
}

export async function enqueueOrderStatusUpdate(orderData: {
  orderId: string;
  userId: string;
  email: string;
  status: string;
  orderDetails: {
    orderNumber: string;
    total: number;
    items: any[];
  };
}) {
  // Create notification task data
  const notificationData: NotificationJob = {
    type: JOB_TYPES.ORDER_STATUS_UPDATE,
    data: {
      orderId: orderData.orderId,
      email: orderData.email,
      orderNumber: orderData.orderDetails.orderNumber,
      total: orderData.orderDetails.total,
      items: orderData.orderDetails.items,
      userId: orderData.userId,
      status: orderData.status
    }
  };

  // Create standardized domain event
  const event = eventPublisher.createEvent(
    EventTypes.NOTIFICATION_SENT,
    orderData.orderId,
    'Order',
    notificationData,
    undefined, // correlationId will be generated
    undefined, // causationId
    orderData.userId
  );

  // Publish event to notification queue
  await eventPublisher.publishNotificationTask(event);
}

export { notificationQueue };