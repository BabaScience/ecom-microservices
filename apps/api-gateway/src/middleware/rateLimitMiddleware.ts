import rateLimit from 'express-rate-limit';

export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later'
    },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit auth endpoints to 5 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later'
    },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});
