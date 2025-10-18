import { Request, Response } from 'express';
import Joi from 'joi';
import { User } from '../models/User';
import { generateToken, ok, error, logger } from '@repo/shared';
import { RegisterRequest, LoginRequest, UpdateProfileRequest } from '@repo/shared';
import { UserEventPublisher } from '../events/publisher';

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    country: Joi.string().optional()
  }).optional()
});

export const register = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = registerSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { email, password, firstName, lastName }: RegisterRequest = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json(error('USER_EXISTS', 'User with this email already exists'));
    }

    // Create new user
    const user = new User({
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      firstName,
      lastName
    });

    await user.save();

    // Publish user registered event
    try {
      await UserEventPublisher.publishUserRegistered(
        (user._id as any).toString(),
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish user registered event', { 
        userId: user._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail registration if event publishing fails
    }

    // Generate JWT token
    const token = generateToken(
      { userId: (user._id as any).toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      process.env.JWT_EXPIRATION || '24h'
    );

    logger.info('User registered', { userId: user._id, email: user.email });

    res.status(201).json(ok({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        address: user.address
      },
      token
    }));
  } catch (err) {
    logger.error('Registration error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Registration failed'));
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = loginSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { email, password }: LoginRequest = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json(error('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json(error('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    // Generate JWT token
    const token = generateToken(
      { userId: (user._id as any).toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      process.env.JWT_EXPIRATION || '24h'
    );

    logger.info('User logged in', { userId: user._id, email: user.email });

    res.json(ok({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        address: user.address
      },
      token
    }));
  } catch (err) {
    logger.error('Login error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Login failed'));
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;

    const foundUser = await User.findById(userId).select('-passwordHash');
    if (!foundUser) {
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    res.json(ok({
      user: {
        _id: foundUser._id,
        email: foundUser.email,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName,
        role: foundUser.role,
        address: foundUser.address,
        createdAt: foundUser.createdAt,
        updatedAt: foundUser.updatedAt
      }
    }));
  } catch (err) {
    logger.error('Get profile error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to get profile'));
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { error: validationError } = updateProfileSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const user = (req as any).user;
    const userId = user.userId;
    const updates: UpdateProfileRequest = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!updatedUser) {
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    // Publish user updated event
    try {
      await UserEventPublisher.publishUserUpdated(
        (updatedUser._id as any).toString(),
        updates,
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish user updated event', { 
        userId: updatedUser._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail profile update if event publishing fails
    }

    logger.info('Profile updated', { userId: updatedUser._id });

    res.json(ok({
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        address: updatedUser.address,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }
    }));
  } catch (err) {
    logger.error('Update profile error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to update profile'));
  }
};

export const createAdminUser = async (req: Request, res: Response) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json(error('FORBIDDEN', 'This endpoint is only available in development'));
    }

    const { error: validationError } = registerSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
    }

    const { email, password, firstName, lastName }: RegisterRequest = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json(error('USER_EXISTS', 'User with this email already exists'));
    }

    // Create new admin user
    const user = new User({
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      firstName,
      lastName,
      role: 'admin' // Set as admin
    });

    await user.save();

    // Publish user registered event (admin users are also registered)
    try {
      await UserEventPublisher.publishUserRegistered(
        (user._id as any).toString(),
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish user registered event', { 
        userId: user._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail admin creation if event publishing fails
    }

    // Generate JWT token
    const token = generateToken(
      { userId: (user._id as any).toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      process.env.JWT_EXPIRATION || '24h'
    );

    logger.info('Admin user created', { userId: user._id, email: user.email });

    res.status(201).json(ok({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        address: user.address
      },
      token
    }));
  } catch (err) {
    logger.error('Create admin user error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to create admin user'));
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-passwordHash');
    if (!user) {
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    res.json(ok({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        address: user.address
      }
    }));
  } catch (err) {
    logger.error('Get user by ID error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to get user'));
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json(error('INVALID_ROLE', 'Role must be either customer or admin'));
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json(error('USER_NOT_FOUND', 'User not found'));
    }

    // Publish user updated event for role change
    try {
      await UserEventPublisher.publishUserUpdated(
        (user._id as any).toString(),
        { role },
        req.headers['x-correlation-id'] as string
      );
    } catch (eventError) {
      logger.warn('Failed to publish user updated event', { 
        userId: user._id, 
        error: eventError instanceof Error ? eventError.message : 'Unknown error' 
      });
      // Don't fail role update if event publishing fails
    }

    logger.info('User role updated', { userId: user._id, newRole: role });

    res.json(ok({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        address: user.address
      }
    }));
  } catch (err) {
    logger.error('Update user role error', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to update user role'));
  }
};
