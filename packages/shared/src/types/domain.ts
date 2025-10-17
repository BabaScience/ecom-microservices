export interface User {
  _id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  currency: string;
  inventory: {
    quantity: number;
    reserved: number;
    available: number;
  };
  category: string;
  images: string[];
  specifications: Record<string, unknown>;
  status: 'active' | 'inactive' | 'discontinued';
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  _id: string;
  orderNumber: string;
  userId: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentInfo: {
    method: string;
    transactionId: string;
    status: string;
  };
  createdAt: Date;
  updatedAt: Date;
  statusHistory: {
    status: string;
    timestamp: Date;
    note: string;
  }[];
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
