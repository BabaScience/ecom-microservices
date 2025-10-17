import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from '@repo/shared';

const SERVICE_REGISTRY = {
  user: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:3003'
};

// Proxy configuration
const proxyOptions = {
  changeOrigin: true,
  onError: (err: any, req: Request, res: Response) => {
    console.error('Proxy error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// User service proxy (auth required for profile routes)
export const userServiceProxy = createProxyMiddleware({
  target: SERVICE_REGISTRY.user,
  ...proxyOptions
});

// Product service proxy (auth required for admin routes)
export const productServiceProxy = createProxyMiddleware({
  target: SERVICE_REGISTRY.product,
  ...proxyOptions
});

// Order service proxy (auth required for all routes)
export const orderServiceProxy = createProxyMiddleware({
  target: SERVICE_REGISTRY.order,
  ...proxyOptions
});

// Protected routes that require authentication
export const protectedRoutes = [
  '/api/users/profile',
  '/api/users/profile/*',
  '/api/products',
  '/api/products/*',
  '/api/orders',
  '/api/orders/*'
];

// Admin routes that require admin role
export const adminRoutes = [
  '/api/products',
  '/api/products/*',
  '/api/orders/*/status'
];

// Check if route requires authentication
export const requiresAuth = (path: string): boolean => {
  return protectedRoutes.some(route => {
    if (route.endsWith('/*')) {
      const baseRoute = route.slice(0, -2);
      return path.startsWith(baseRoute);
    }
    return path === route;
  });
};

// Check if route requires admin role
export const requiresAdmin = (path: string): boolean => {
  return adminRoutes.some(route => {
    if (route.endsWith('/*')) {
      const baseRoute = route.slice(0, -2);
      return path.startsWith(baseRoute);
    }
    return path === route;
  });
};
