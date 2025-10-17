import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { correlationId, errorHandler, logger, authMiddleware } from '@repo/shared';
import { rateLimitMiddleware, authRateLimitMiddleware } from './middleware/rateLimitMiddleware';
import { userServiceProxy, productServiceProxy, orderServiceProxy, requiresAuth, requiresAdmin } from './routes/proxy';

const app = express();
const port = Number(process.env.GATEWAY_PORT) || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
app.use(rateLimitMiddleware);

// Body parsing and correlation ID
app.use(express.json());
app.use(correlationId);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

// Auth routes (with stricter rate limiting)
app.use('/api/users/register', authRateLimitMiddleware);
app.use('/api/users/login', authRateLimitMiddleware);

// User service routes
app.use('/api/users', (req, res, next) => {
  if (requiresAuth(req.path)) {
    return authMiddleware(req, res, next);
  }
  next();
}, userServiceProxy);

// Product service routes
app.use('/api/products', (req, res, next) => {
  if (requiresAuth(req.path)) {
    return authMiddleware(req, res, next);
  }
  next();
}, productServiceProxy);

// Order service routes (all require auth)
app.use('/api/orders', authMiddleware, orderServiceProxy);

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info('API Gateway listening', { port });
});

