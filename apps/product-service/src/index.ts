import express from 'express';
import { correlationId, errorHandler, ok, logger } from '@repo/shared';

const app = express();
const port = Number(process.env.PRODUCT_SERVICE_PORT) || 3002;

app.use(express.json());
app.use(correlationId);

app.get('/health', (_req, res) => {
  res.json(ok({
    status: 'healthy',
    service: 'product-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

app.use(errorHandler);

app.listen(port, () => {
  logger.info('Product Service listening', { port });
});

