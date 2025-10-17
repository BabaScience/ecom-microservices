import express from 'express';
import { correlationId, errorHandler, ok, logger } from '@repo/shared';

const app = express();
const port = Number(process.env.USER_SERVICE_PORT) || 3001;

app.use(express.json());
app.use(correlationId);

app.get('/health', (_req, res) => {
  res.json(ok({
    status: 'healthy',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

app.use(errorHandler);

app.listen(port, () => {
  logger.info('User Service listening', { port });
});

