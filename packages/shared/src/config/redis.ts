import IORedis from 'ioredis';

// Shared Redis connection configuration for BullMQ
export const createRedisConnection = (): IORedis => {
  return new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,  // Required for BullMQ
    enableReadyCheck: false,     // Required for BullMQ
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 30000,
    enableAutoPipelining: true
  });
};

// Default connection instance
export const redisConnection = createRedisConnection();

// Connection event handlers
redisConnection.on('connect', () => {
  console.log('Redis connected successfully');
});

redisConnection.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redisConnection.on('close', () => {
  console.log('Redis connection closed');
});

redisConnection.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

redisConnection.on('ready', () => {
  console.log('Redis ready for commands');
});

// Graceful shutdown
export const closeRedisConnection = async (): Promise<void> => {
  try {
    await redisConnection.quit();
    console.log('Redis connection closed gracefully');
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
};

// Health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redisConnection.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};
