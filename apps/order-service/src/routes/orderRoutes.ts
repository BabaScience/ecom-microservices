import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '@repo/shared';
import {
  createOrder,
  listOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus
} from '../controllers/orderController';

const router = Router();

// Protected routes
router.post('/', authMiddleware, createOrder);
router.get('/', authMiddleware, listOrders);
router.get('/:id', authMiddleware, getOrder);
router.put('/:id/cancel', authMiddleware, cancelOrder);

// Admin protected routes
router.put('/:id/status', authMiddleware, adminMiddleware, updateOrderStatus);

export default router;
