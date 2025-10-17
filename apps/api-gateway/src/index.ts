import express from 'express';
import { correlationId, errorHandler, ok, logger } from '@repo/shared';

const app = express();
const port = Number(process.env.GATEWAY_PORT) || 3000;

app.use(express.json());
app.use(correlationId);

app.get('/health', (_req, res) => {
  res.json(ok({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

app.use(errorHandler);

app.listen(port, () => {
  logger.info('API Gateway listening', { port });
});

