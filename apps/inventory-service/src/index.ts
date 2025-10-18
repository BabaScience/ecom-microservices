import express from 'express';
import mongoose from 'mongoose';
import { logger } from '@repo/shared';
import { getWorkerHealth } from './workers/orderEventWorker';

const app = express();
const PORT = process.env.INVENTORY_SERVICE_PORT || 3005;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getWorkerHealth();
    const status = health.status === 'healthy' ? 200 : 503;
    res.status(status).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'inventory-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Service info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: 'inventory-service',
    version: '1.0.0',
    description: 'Consumer-only service for inventory management',
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const health = await getWorkerHealth();
    res.json({
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      ...health
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Database connection
async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_inventory';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB', { uri: mongoUri });
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

// Start server
async function startServer() {
  try {
    await connectDatabase();
    
    app.listen(PORT, () => {
      logger.info('Inventory service started', { 
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });
    });
  } catch (error) {
    logger.error('Failed to start inventory service', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down inventory service...');
  
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
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

// Start the service
startServer();
