import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
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
  fullName: string;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer'
  },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: '' }
  }
}, {
  timestamps: true
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  if (this.isModified('passwordHash')) {
    const saltRounds = 12;
    this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

// Indexes (removed duplicate email index since it's already unique)

export const User = mongoose.model<IUser>('User', userSchema);
