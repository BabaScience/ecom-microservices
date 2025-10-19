import { OrderConfirmationData, OrderStatusUpdateData, EmailTemplate } from '../types/notifications';

export function renderOrderConfirmationEmail(data: OrderConfirmationData): EmailTemplate {
  const { orderDetails } = data;
  
  if (!orderDetails) {
    throw new Error('OrderConfirmationData is missing orderDetails property');
  }
  
  const subject = `Order Confirmation - ${orderDetails.orderNumber}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .order-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .item { border-bottom: 1px solid #eee; padding: 10px 0; }
        .total { font-weight: bold; font-size: 18px; color: #4A90E2; }
        .address { background-color: #f0f8ff; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmation</h1>
          <p>Thank you for your order!</p>
        </div>
        <div class="content">
          <h2>Order Details</h2>
          <div class="order-details">
            <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <h3>Items Ordered</h3>
          ${orderDetails.items.map(item => `
            <div class="item">
              <strong>${item.productName}</strong><br>
              Quantity: ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${item.totalPrice.toFixed(2)}
            </div>
          `).join('')}
          
          <div class="total">
            <p>Total: $${orderDetails.total.toFixed(2)}</p>
          </div>
          
          <h3>Shipping Address</h3>
          <div class="address">
            ${orderDetails.shippingAddress.street}<br>
            ${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.zipCode}<br>
            ${orderDetails.shippingAddress.country}
          </div>
          
          <p>We'll send you another email when your order ships!</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Order Confirmation - ${orderDetails.orderNumber}

Thank you for your order!

Order Details:
- Order Number: ${orderDetails.orderNumber}
- Order Date: ${new Date().toLocaleDateString()}

Items Ordered:
${orderDetails.items.map(item => 
  `- ${item.productName} (Qty: ${item.quantity} × $${item.unitPrice.toFixed(2)}) = $${item.totalPrice.toFixed(2)}`
).join('\n')}

Total: $${orderDetails.total.toFixed(2)}

Shipping Address:
${orderDetails.shippingAddress.street}
${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.zipCode}
${orderDetails.shippingAddress.country}

We'll send you another email when your order ships!
  `;
  
  return { subject, html, text };
}

export function renderOrderStatusUpdateEmail(data: OrderStatusUpdateData): EmailTemplate {
  const { status, orderNumber, note } = data;
  
  const statusMessages = {
    'pending': 'Your order is waiting for payment',
    'payment_processing': 'Your payment is being processed',
    'confirmed': 'Your order has been confirmed',
    'processing': 'Your order is being prepared for shipment',
    'shipped': 'Your order has been shipped',
    'delivered': 'Your order has been delivered',
    'cancelled': 'Your order has been cancelled',
    'failed': 'Your order processing failed'
  };
  
  const subject = `Order Update - ${orderNumber}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Status Update</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .status { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; text-align: center; }
        .status-${status} { border-left: 4px solid #4A90E2; }
        .note { background-color: #f0f8ff; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Status Update</h1>
        </div>
        <div class="content">
          <div class="status status-${status}">
            <h2>Order #${orderNumber}</h2>
            <p><strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
            <p>${statusMessages[status]}</p>
          </div>
          
          ${note ? `
            <div class="note">
              <h3>Additional Information</h3>
              <p>${note}</p>
            </div>
          ` : ''}
          
          <p>Thank you for choosing our service!</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Order Status Update - ${orderNumber}

Order #${orderNumber}
Status: ${status.charAt(0).toUpperCase() + status.slice(1)}
${statusMessages[status]}

${note ? `Additional Information:\n${note}\n` : ''}
Thank you for choosing our service!
  `;
  
  return { subject, html, text };
}

export function renderWelcomeEmail(data: { userId: string; email: string; firstName: string; lastName: string }): EmailTemplate {
  const { firstName, lastName } = data;
  
  const subject = `Welcome to our E-commerce Platform!`;
  
  const html = `
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
            <h2>Hello ${firstName} ${lastName}!</h2>
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
  
  const text = `
Welcome to Our Platform!

Hello ${firstName} ${lastName}!

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
  
  return { subject, html, text };
}

