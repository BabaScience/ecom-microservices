import { Worker, Queue } from 'bullmq';
import { logger, redisConnection, idempotencyGuard, DomainEvent, EventTypes, NotificationJob, OrderConfirmationData, OrderStatusUpdateData } from '@repo/shared';
import { sendGridService, EmailTemplate } from '../services/sendgridService';

// Create the notification tasks queue
const notificationTasksQueue = new Queue('notification.tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: false
  },
  limiter: {
    max: 1000,
    duration: 1000
  }
});

// Create the worker for notification tasks
const worker = new Worker('notification.tasks', async (job) => {
  const event = job.data as DomainEvent<NotificationJob>;
  
  logger.info('Processing notification task', { 
    jobId: job.id, 
    eventId: event.eventId,
    eventType: event.eventType,
    jobType: event.data.type
  });

  // Idempotency check
  const processed = await idempotencyGuard.isProcessed(event.eventId);
  if (processed) {
    logger.info('Event already processed, skipping', { 
      eventId: event.eventId,
      jobId: job.id 
    });
    return { status: 'duplicate', eventId: event.eventId };
  }

  try {
    switch (event.data.type) {
      case 'order-confirmation':
        return await handleOrderConfirmation(event.data.data as OrderConfirmationData);
      
      case 'order-status-update':
        return await handleOrderStatusUpdate(event.data.data as OrderStatusUpdateData);
      
      case 'welcome-email':
        return await handleWelcomeEmail(event.data.data as { userId: string; email: string; firstName: string; lastName: string });
      
      case 'profile-update-email':
        logger.info('Profile update email not yet implemented', { userId: event.data.data.userId });
        return { status: 'ignored', jobType: event.data.type };
      
      case 'account-deletion-email':
        logger.info('Account deletion email not yet implemented', { userId: event.data.data.userId });
        return { status: 'ignored', jobType: event.data.type };
      
      case 'password-reset-email':
        logger.info('Password reset email not yet implemented', { userId: event.data.data.userId });
        return { status: 'ignored', jobType: event.data.type };
      
      default:
        logger.info('Ignoring notification job type', { jobType: event.data.type });
        return { status: 'ignored', jobType: event.data.type };
    }
  } catch (error) {
    logger.error('Failed to process notification task', { 
      jobId: job.id, 
      eventId: event.eventId,
      jobType: event.data.type,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000
  },
  lockDuration: 30000,
  stalledInterval: 30000,
  metrics: {
    maxDataPoints: 100
  }
});

async function handleOrderConfirmation(data: OrderConfirmationData) {
  const { orderId, userId, email, orderDetails } = data;
  
  logger.info('Handling order confirmation email', { orderId, email });
  
  const template: EmailTemplate = {
    subject: `Order Confirmation - ${orderDetails.orderNumber}`,
    html: generateOrderConfirmationHTML(orderDetails),
    text: generateOrderConfirmationText(orderDetails)
  };
  
  await sendGridService.sendEmail({
    to: email,
    template,
    data: orderDetails
  });
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(crypto.randomUUID(), { 
    status: 'success' 
  });
  
  return { status: 'success', orderId, email };
}

async function handleOrderStatusUpdate(data: OrderStatusUpdateData) {
  const { orderId, email, status, orderNumber, note } = data;
  
  logger.info('Handling order status update email', { orderId, email, status });
  
  const template: EmailTemplate = {
    subject: `Order Update - ${orderNumber}`,
    html: generateOrderStatusUpdateHTML({ status, orderNumber, note }),
    text: generateOrderStatusUpdateText({ status, orderNumber, note })
  };
  
  await sendGridService.sendEmail({
    to: email,
    template,
    data: { status, orderNumber, note }
  });
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(crypto.randomUUID(), { 
    status: 'success' 
  });
  
  return { status: 'success', orderId, email, status };
}

async function handleWelcomeEmail(data: { userId: string; email: string; firstName: string; lastName: string }) {
  const { userId, email, firstName, lastName } = data;
  
  logger.info('Handling welcome email', { userId, email, firstName, lastName });
  
  const template: EmailTemplate = {
    subject: `Welcome to our E-commerce Platform!`,
    html: generateWelcomeEmailHTML({ firstName, lastName }),
    text: generateWelcomeEmailText({ firstName, lastName })
  };
  
  await sendGridService.sendEmail({
    to: email,
    template,
    data: { firstName, lastName }
  });
  
  // Mark as processed
  await idempotencyGuard.markAsProcessed(crypto.randomUUID(), { 
    status: 'success' 
  });
  
  return { status: 'success', userId, email };
}

function generateOrderConfirmationHTML(orderDetails: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Order Confirmation</h1>
      <p>Thank you for your order!</p>
      
      <h2>Order Details</h2>
      <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>
      <p><strong>Total:</strong> $${orderDetails.total.toFixed(2)}</p>
      
      <h3>Items</h3>
      <ul>
        ${orderDetails.items.map((item: any) => `
          <li>${item.productName} - Qty: ${item.quantity} - $${item.totalPrice.toFixed(2)}</li>
        `).join('')}
      </ul>
      
      <h3>Shipping Address</h3>
      <p>
        ${orderDetails.shippingAddress.street}<br>
        ${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.zipCode}<br>
        ${orderDetails.shippingAddress.country}
      </p>
      
      <p>We'll send you another email when your order ships.</p>
      
      <p>Thank you for shopping with us!</p>
    </body>
    </html>
  `;
}

function generateOrderConfirmationText(orderDetails: any): string {
  return `
Order Confirmation

Thank you for your order!

Order Details:
Order Number: ${orderDetails.orderNumber}
Total: $${orderDetails.total.toFixed(2)}

Items:
${orderDetails.items.map((item: any) => `- ${item.productName} - Qty: ${item.quantity} - $${item.totalPrice.toFixed(2)}`).join('\n')}

Shipping Address:
${orderDetails.shippingAddress.street}
${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.zipCode}
${orderDetails.shippingAddress.country}

We'll send you another email when your order ships.

Thank you for shopping with us!
  `;
}

function generateOrderStatusUpdateHTML(data: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Update</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Order Update</h1>
      <p>Your order status has been updated.</p>
      
      <h2>Order Details</h2>
      <p><strong>Order Number:</strong> ${data.orderNumber}</p>
      <p><strong>Status:</strong> ${data.status}</p>
      ${data.note ? `<p><strong>Note:</strong> ${data.note}</p>` : ''}
      
      <p>Thank you for your patience!</p>
    </body>
    </html>
  `;
}

function generateOrderStatusUpdateText(data: any): string {
  return `
Order Update

Your order status has been updated.

Order Details:
Order Number: ${data.orderNumber}
Status: ${data.status}
${data.note ? `Note: ${data.note}` : ''}

Thank you for your patience!
  `;
}

function generateWelcomeEmailHTML(data: { firstName: string; lastName: string }): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Welcome!</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .welcome { background-color: white; padding: 20px; margin: 15px 0; border-radius: 5px; text-align: center; }
        .features { background-color: #f0f8ff; padding: 15px; border-radius: 5px; }
        .cta { background-color: #4A90E2; color: white; padding: 15px; border-radius: 5px; text-align: center; }
        .cta a { color: white; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Our Platform!</h1>
        </div>
        <div class="content">
          <div class="welcome">
            <h2>Hello ${data.firstName} ${data.lastName}!</h2>
            <p>Thank you for joining our e-commerce platform. We're excited to have you as part of our community!</p>
          </div>
          
          <div class="features">
            <h3>What you can do:</h3>
            <ul>
              <li>Browse our extensive product catalog</li>
              <li>Create and manage your orders</li>
              <li>Track your shipments in real-time</li>
              <li>Manage your profile and preferences</li>
              <li>Get exclusive member discounts</li>
            </ul>
          </div>
          
          <div class="cta">
            <h3>Ready to start shopping?</h3>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/products">Browse Products</a></p>
          </div>
          
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Happy shopping!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateWelcomeEmailText(data: { firstName: string; lastName: string }): string {
  return `
Welcome to Our Platform!

Hello ${data.firstName} ${data.lastName}!

Thank you for joining our e-commerce platform. We're excited to have you as part of our community!

What you can do:
- Browse our extensive product catalog
- Create and manage your orders
- Track your shipments in real-time
- Manage your profile and preferences
- Get exclusive member discounts

Ready to start shopping?
Visit: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/products

If you have any questions, feel free to contact our support team.

Happy shopping!
  `;
}

// Event handlers
worker.on('completed', (job, result) => {
  logger.info('Notification task completed', { 
    jobId: job.id, 
    eventId: job.data?.eventId,
    jobType: job.data?.data?.type,
    duration: Date.now() - job.timestamp,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Notification task failed', { 
    jobId: job?.id, 
    eventId: job?.data?.eventId,
    jobType: job?.data?.data?.type,
    error: error.message,
    attempts: job?.attemptsMade,
    stack: error.stack
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Notification task stalled', { jobId });
});

worker.on('error', (error) => {
  logger.error('Email worker error', { 
    error: error.message,
    stack: error.stack 
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down email service gracefully...');
  
  try {
    await worker.close();
    await notificationTasksQueue.close();
    logger.info('Email service shutdown complete');
  } catch (error) {
    logger.error('Error during email service shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Health check function
export const getEmailWorkerHealth = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      notificationTasksQueue.getWaitingCount(),
      notificationTasksQueue.getActiveCount(),
      notificationTasksQueue.getCompletedCount(),
      notificationTasksQueue.getFailedCount()
    ]);
    
    return {
      status: 'healthy',
      service: 'email-service',
      queue: 'notification.tasks',
      metrics: {
        waiting,
        active,
        completed,
        failed
      },
      redis: await redisConnection.ping() === 'PONG',
      sendgrid: sendGridService.isServiceAvailable()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      service: 'email-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export { worker, notificationTasksQueue };
