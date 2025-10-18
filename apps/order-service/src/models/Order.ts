import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IOrder extends Document {
  orderNumber: string;
  userId: string;
  items: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  pricing: {
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number;
    total: number;
  };
  status: 'pending' | 'payment_processing' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'failed';
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
  saga: {
    id: string;
    status: 'in_progress' | 'completed' | 'compensating' | 'failed';
    currentStep: string;
    completedSteps: string[];
    compensatedSteps: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  version: number;
  statusHistory: {
    status: string;
    timestamp: Date;
    note: string;
  }[];
}

const orderSchema = new Schema<IOrder>({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  items: [{
    productId: {
      type: String,
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    sku: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    tax: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    shipping: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    enum: ['pending', 'payment_processing', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'],
    default: 'pending'
  },
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  paymentInfo: {
    method: { type: String, default: 'pending' },
    transactionId: { type: String, default: '' },
    status: { type: String, default: 'pending' }
  },
  saga: {
    id: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'compensating', 'failed'],
      default: 'in_progress'
    },
    currentStep: {
      type: String,
      default: 'order_created'
    },
    completedSteps: [{
      type: String
    }],
    compensatedSteps: [{
      type: String
    }]
  },
  version: {
    type: Number,
    default: 1
  },
  statusHistory: [{
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: '' }
  }]
}, {
  timestamps: true
});

// Pre-save hook to generate order number and saga ID
orderSchema.pre('save', function(next) {
  console.log('Pre-save hook running, isNew:', this.isNew);
  
  if (this.isNew) {
    console.log('Document is new, generating orderNumber and saga.id');
    
    if (!this.orderNumber) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      this.orderNumber = `ORD-${timestamp}-${random}`;
      console.log('Generated orderNumber:', this.orderNumber);
    }
    
    if (!this.saga.id) {
      this.saga.id = crypto.randomUUID();
      console.log('Generated saga.id:', this.saga.id);
    }
    
    // Initialize saga state
    if (!this.saga.completedSteps) {
      this.saga.completedSteps = [];
    }
    if (!this.saga.compensatedSteps) {
      this.saga.compensatedSteps = [];
    }
  }
  next();
});

// Pre-save hook to add status to history
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: `Status changed to ${this.status}`
    });
  }
  next();
});

// Indexes
orderSchema.index({ userId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'saga.id': 1 });
orderSchema.index({ 'saga.status': 1 });
orderSchema.index({ 'saga.currentStep': 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
