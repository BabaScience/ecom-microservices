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

