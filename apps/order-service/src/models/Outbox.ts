import mongoose, { Schema, Document } from 'mongoose';

export interface IOutbox extends Document {
  eventId: string;
  aggregateId: string;      // Order ID, User ID, etc.
  aggregateType: string;    // 'Order', 'User'
  eventType: string;       // 'order.created'
  eventData: any;          // Event payload
  published: boolean;      // Publishing status
  publishedAt: Date | null;
  retryCount: number;
  createdAt: Date;
  processedAt: Date | null;
}

const outboxSchema = new Schema<IOutbox>({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  aggregateId: {
    type: String,
    required: true,
    index: true
  },
  aggregateType: {
    type: String,
    required: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  eventData: {
    type: Schema.Types.Mixed,
    required: true
  },
  published: {
    type: Boolean,
    default: false,
    index: true
  },
  publishedAt: {
    type: Date,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0,
    index: true
  },
  processedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
outboxSchema.index({ published: 1, retryCount: 1 });
outboxSchema.index({ createdAt: 1 });
outboxSchema.index({ aggregateId: 1, aggregateType: 1 });

// Pre-save hook to set processedAt
outboxSchema.pre('save', function(next) {
  if (this.isModified('published') && this.published && !this.processedAt) {
    this.processedAt = new Date();
  }
  next();
});

export const Outbox = mongoose.model<IOutbox>('Outbox', outboxSchema);
