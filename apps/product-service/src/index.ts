import express from 'express';
import { correlationId, errorHandler, logger, connectToMongoDB } from '@repo/shared';
import productRoutes from './routes/productRoutes';

const app = express();
const port = Number(process.env.PRODUCT_SERVICE_PORT) || 3002;

// Middleware
app.use(express.json());
app.use(correlationId);

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/ecommerce_products?authSource=admin';
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
      service: 'product-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

app.use('/api/products', productRoutes);

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info('Product Service listening', { port });
});

