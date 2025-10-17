import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '@repo/shared';
import { register, login, getProfile, updateProfile, getUserById, updateUserRole, createAdminUser } from '../controllers/userController';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Development route (no auth, development only)
router.post('/create-admin', createAdminUser);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);

// Admin routes
router.put('/:id/role', authMiddleware, adminMiddleware, updateUserRole);

// Internal route (no auth for service-to-service calls)
router.get('/:id', getUserById);

export default router;
