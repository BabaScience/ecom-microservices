import express from 'express';
import { correlationId, errorHandler, logger, connectToMongoDB } from '@repo/shared';
import userRoutes from './routes/userRoutes';

const app = express();
const port = Number(process.env.USER_SERVICE_PORT) || 3001;

// Middleware
app.use(express.json());
app.use(correlationId);

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/ecommerce_users?authSource=admin';
connectToMongoDB(mongoUri).catch(err => {
  logger.error('Failed to connect to MongoDB', { error: err });
  process.exit(1);
});

// Routes
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

app.use('/api/users', userRoutes);

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info('User Service listening', { port });
});

