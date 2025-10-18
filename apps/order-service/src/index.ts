import express from 'express';
import { correlationId, errorHandler, logger, connectToMongoDB, DLQPublisher, ok, error } from '@repo/shared';
import orderRoutes from './routes/orderRoutes';
import { dlqWorker } from './workers/dlqWorker';

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

// DLQ Monitoring endpoints
app.get('/api/dlq/stats', async (_req, res) => {
  try {
    const stats = await DLQPublisher.getDLQStats();
    res.json(ok({ stats }));
  } catch (err) {
    logger.error('Failed to get DLQ stats', { error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to get DLQ statistics'));
  }
});

app.post('/api/dlq/retry/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await DLQPublisher.retryFromDLQ(jobId);
    res.json(ok({ message: 'Job retried successfully', jobId }));
  } catch (err) {
    logger.error('Failed to retry DLQ job', { jobId: req.params.jobId, error: err });
    res.status(500).json(error('INTERNAL_ERROR', 'Failed to retry job'));
  }
});

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  logger.info('Order Service listening', { port });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    // Close DLQ worker
    await dlqWorker.close();
    
    logger.info('Order Service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

