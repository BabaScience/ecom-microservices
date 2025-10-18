import { redisConnection } from '../config/redis';

// Idempotency middleware for event consumers as specified in the architecture spec
export class IdempotencyGuard {
  constructor(private redis = redisConnection) {}
  
  async processIdempotently<T>(
    eventId: string,
    processFn: () => Promise<T>
  ): Promise<T> {
    const idempotencyKey = `idempotency:${eventId}`;
    
    // Check if already processed
    const processed = await this.redis.get(idempotencyKey);
    if (processed) {
      console.log(`Event ${eventId} already processed, skipping`);
      return JSON.parse(processed);
    }
    
    // Process the event
    const result = await processFn();
    
    // Store result with TTL (7 days)
    await this.redis.setex(
      idempotencyKey,
      7 * 24 * 60 * 60,
      JSON.stringify(result)
    );
    
    return result;
  }
  
  // Check if event was already processed without processing
  async isProcessed(eventId: string): Promise<boolean> {
    const idempotencyKey = `idempotency:${eventId}`;
    const processed = await this.redis.get(idempotencyKey);
    return processed !== null;
  }
  
  // Mark event as processed without storing result
  async markAsProcessed(eventId: string, result?: any): Promise<void> {
    const idempotencyKey = `idempotency:${eventId}`;
    const value = result ? JSON.stringify(result) : 'processed';
    
    await this.redis.setex(
      idempotencyKey,
      7 * 24 * 60 * 60,
      value
    );
  }
  
  // Clear idempotency record (useful for testing)
  async clearProcessed(eventId: string): Promise<void> {
    const idempotencyKey = `idempotency:${eventId}`;
    await this.redis.del(idempotencyKey);
  }
  
  // Get processing statistics
  async getStats(): Promise<{
    totalProcessed: number;
    recentProcessed: number;
  }> {
    const keys = await this.redis.keys('idempotency:*');
    const totalProcessed = keys.length;
    
    // Count recent processed (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    let recentProcessed = 0;
    
    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        const createdAt = Date.now() - (ttl * 1000);
        if (createdAt > oneDayAgo) {
          recentProcessed++;
        }
      }
    }
    
    return {
      totalProcessed,
      recentProcessed
    };
  }
}

// Default idempotency guard instance
export const idempotencyGuard = new IdempotencyGuard();

// Helper function to check if event should be processed
export const shouldProcessEvent = async (eventId: string): Promise<boolean> => {
  return !(await idempotencyGuard.isProcessed(eventId));
};
