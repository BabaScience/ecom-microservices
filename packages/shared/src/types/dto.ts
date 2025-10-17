export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export interface CreateProductRequest {
  name: string;
  description: string;
  sku: string;
  price: number;
  currency?: string;
  inventory: {
    quantity: number;
  };
  category: string;
  images?: string[];
  specifications?: Record<string, unknown>;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  inventory?: {
    quantity?: number;
  };
  category?: string;
  images?: string[];
  specifications?: Record<string, unknown>;
  status?: 'active' | 'inactive' | 'discontinued';
}

export interface ReserveInventoryRequest {
  quantity: number;
}

export interface CreateOrderRequest {
  items: {
    productId: string;
    quantity: number;
  }[];
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface UpdateOrderStatusRequest {
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  note?: string;
}
