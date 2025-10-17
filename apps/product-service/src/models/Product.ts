import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
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

const productSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP']
  },
  inventory: {
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    reserved: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  images: [{
    type: String,
    trim: true
  }],
  specifications: {
    type: Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Virtual for available inventory
productSchema.virtual('inventory.available').get(function() {
  return Math.max(0, this.inventory.quantity - this.inventory.reserved);
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Indexes (removed duplicate sku index since it's already unique)
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);