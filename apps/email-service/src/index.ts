import express from 'express';
import { logger } from '@repo/shared';
import { getEmailWorkerHealth } from './workers/emailWorker';

const app = express();
const PORT = process.env.EMAIL_SERVICE_PORT || 3006;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getEmailWorkerHealth();
    const status = health.status === 'healthy' ? 200 : 503;
    res.status(status).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'email-service',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Service info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: 'email-service',
    version: '1.0.0',
    description: 'Consumer-only service for email delivery',
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const health = await getEmailWorkerHealth();
    res.json({
      service: 'email-service',
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

// Start server
async function startServer() {
  try {
    app.listen(PORT, () => {
      logger.info('Email service started', { 
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });
    });
  } catch (error) {
    logger.error('Failed to start email service', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down email service...');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the service
startServer();
