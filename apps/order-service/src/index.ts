import express from 'express';
import { correlationId, errorHandler, logger, connectToMongoDB } from '@repo/shared';
import orderRoutes from './routes/orderRoutes';

const app = express();
const port = Number(process.env.ORDER_SERVICE_PORT) || 3003;

// Middleware
app.use(express.json());
app.use(correlationId);

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/ecommerce_orders?authSource=admin';
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
      service: 'order-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

app.use('/api/orders', orderRoutes);

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info('Order Service listening', { port });
});

