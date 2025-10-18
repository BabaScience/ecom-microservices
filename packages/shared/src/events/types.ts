// Domain Event interface as specified in the architecture spec
export interface DomainEvent<T = any> {
  eventId: string;              // Unique event identifier (UUID)
  eventType: string;            // e.g., 'order.created'
  aggregateId: string;          // Entity ID (Order ID, User ID, etc.)
  aggregateType: string;        // Entity type ('Order', 'User')
  occurredAt: string;           // ISO 8601 timestamp
  version: number;               // Event schema version
  correlationId: string;        // Request correlation ID
  causationId: string | null;   // Parent event ID (for event chains)
  data: T;                      // Event-specific payload
  metadata: {
    userId?: string;            // User who triggered the event
    source: string;             // Service that produced the event
    environment: string;        // 'production', 'staging', 'development'
  };
}

// Event types enum for type safety
export enum EventTypes {
  // Order events
  ORDER_CREATED = 'order.created',
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_SHIPPED = 'order.shipped',
  ORDER_DELIVERED = 'order.delivered',
  ORDER_FAILED = 'order.failed',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  PASSWORD_RESET_REQUESTED = 'user.password_reset_requested',
  
  // Product events
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_DELETED = 'product.deleted',
  INVENTORY_UPDATED = 'inventory.updated',
  
  // Inventory events
  INVENTORY_RESERVED = 'inventory.reserved',
  INVENTORY_RELEASED = 'inventory.released',
  INVENTORY_INSUFFICIENT = 'inventory.insufficient',
  INVENTORY_CONFIRMED = 'inventory.confirmed',
  
  // Payment events
  PAYMENT_PROCESSED = 'payment.processed',
  PAYMENT_FAILED = 'payment.failed',
  
  // Notification events
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_FAILED = 'notification.failed'
}

// Event payload interfaces
export interface OrderCreatedData {
  orderNumber: string;
  userId: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  total: number;
  status: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface UserRegisteredData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface InventoryReservedData {
  orderId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
}

// Notification types
export interface OrderConfirmationData {
  orderId: string;
  userId: string;
  email: string;
  orderDetails: {
    orderNumber: string;
    total: number;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    shippingAddress: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };
}

export interface OrderStatusUpdateData {
  orderId: string;
  email: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  orderNumber: string;
  note?: string;
}

export type NotificationJob = 
  | { type: 'order-confirmation'; data: OrderConfirmationData }
  | { type: 'order-status-update'; data: OrderStatusUpdateData };

export const JOB_TYPES = {
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_STATUS_UPDATE: 'order-status-update'
} as const;

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}
