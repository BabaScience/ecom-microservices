import express from 'express';
import { correlationId, errorHandler, ok, logger } from '@repo/shared';

const app = express();
const port = Number(process.env.ORDER_SERVICE_PORT) || 3003;

app.use(express.json());
app.use(correlationId);

app.get('/health', (_req, res) => {
  res.json(ok({
    status: 'healthy',
    service: 'order-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

app.use(errorHandler);

app.listen(port, () => {
  logger.info('Order Service listening', { port });
});

