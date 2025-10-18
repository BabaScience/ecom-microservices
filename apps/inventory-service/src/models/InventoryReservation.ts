import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryReservation extends Document {
  orderId: string;
  productId: string;
  quantity: number;
  status: 'reserved' | 'released' | 'expired';
  expiresAt: Date;
  reservedAt: Date;
  releasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryReservationSchema = new Schema<IInventoryReservation>({
  orderId: {
    type: String,
    required: true,
    index: true
  },
  productId: {
    type: String,
    required: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['reserved', 'released', 'expired'],
    default: 'reserved',
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  reservedAt: {
    type: Date,
    default: Date.now
  },
  releasedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
inventoryReservationSchema.index({ orderId: 1, productId: 1 });
inventoryReservationSchema.index({ expiresAt: 1, status: 1 });
inventoryReservationSchema.index({ status: 1, expiresAt: 1 });

// Pre-save hook to set releasedAt when status changes to released
inventoryReservationSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'released' && !this.releasedAt) {
    this.releasedAt = new Date();
  }
  next();
});

export const InventoryReservation = mongoose.model<IInventoryReservation>('InventoryReservation', inventoryReservationSchema);
