import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '@repo/shared';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  reserveInventory,
  releaseInventory
} from '../controllers/productController';

const router = Router();

// Public routes
router.get('/', listProducts);
router.get('/:id', getProduct);

// Admin protected routes
router.post('/', authMiddleware, adminMiddleware, createProduct);
router.put('/:id', authMiddleware, adminMiddleware, updateProduct);
router.delete('/:id', authMiddleware, adminMiddleware, deleteProduct);

// Internal routes (no auth for service-to-service calls)
router.post('/:id/reserve', reserveInventory);
router.post('/:id/release', releaseInventory);

export default router;
