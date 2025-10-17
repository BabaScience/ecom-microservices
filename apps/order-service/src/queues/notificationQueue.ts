import Bull from 'bull';

const notificationQueue = new Bull('notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379
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
  const jobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  };

  await notificationQueue.add('order-confirmation', orderData, jobOptions);
}

export { notificationQueue };