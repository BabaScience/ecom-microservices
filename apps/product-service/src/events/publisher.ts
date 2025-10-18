import { Queue } from 'bullmq';
import { redisConnection, logger, EventTypes, DomainEvent } from '@repo/shared';

// Initialize product events queue
const productEventsQueue = new Queue('product.events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

export class ProductEventPublisher {
  /**
   * Publish product created event
   */
  static async publishProductCreated(
    productId: string,
    productData: {
      name: string;
      sku: string;
      price: number;
      category: string;
      inventory: { quantity: number };
    },
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{
        productId: string;
        name: string;
        sku: string;
        price: number;
        category: string;
        inventory: { quantity: number };
      }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.PRODUCT_CREATED,
        aggregateId: productId,
        aggregateType: 'Product',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          productId,
          name: productData.name,
          sku: productData.sku,
          price: productData.price,
          category: productData.category,
          inventory: productData.inventory
        },
        metadata: {
          source: 'product-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await productEventsQueue.add(EventTypes.PRODUCT_CREATED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('Product created event published', {
        eventId: event.eventId,
        productId,
        sku: productData.sku
      });
    } catch (error) {
      logger.error('Failed to publish product created event', {
        productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish product updated event
   */
  static async publishProductUpdated(
    productId: string,
    updatedFields: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{
        productId: string;
        updatedFields: Record<string, any>;
      }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.PRODUCT_UPDATED,
        aggregateId: productId,
        aggregateType: 'Product',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          productId,
          updatedFields
        },
        metadata: {
          source: 'product-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await productEventsQueue.add(EventTypes.PRODUCT_UPDATED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('Product updated event published', {
        eventId: event.eventId,
        productId,
        updatedFields: Object.keys(updatedFields)
      });
    } catch (error) {
      logger.error('Failed to publish product updated event', {
        productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish product deleted event
   */
  static async publishProductDeleted(
    productId: string,
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{ productId: string }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.PRODUCT_DELETED,
        aggregateId: productId,
        aggregateType: 'Product',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          productId
        },
        metadata: {
          source: 'product-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await productEventsQueue.add(EventTypes.PRODUCT_DELETED, event, {
        priority: 1,
        delay: 0
      });

      logger.info('Product deleted event published', {
        eventId: event.eventId,
        productId
      });
    } catch (error) {
      logger.error('Failed to publish product deleted event', {
        productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish inventory updated event
   */
  static async publishInventoryUpdated(
    productId: string,
    inventoryData: {
      quantity: number;
      reserved: number;
      available: number;
    },
    correlationId?: string
  ): Promise<void> {
    try {
      const event: DomainEvent<{
        productId: string;
        inventory: {
          quantity: number;
          reserved: number;
          available: number;
        };
      }> = {
        eventId: crypto.randomUUID(),
        eventType: EventTypes.INVENTORY_UPDATED,
        aggregateId: productId,
        aggregateType: 'Product',
        occurredAt: new Date().toISOString(),
        version: 1,
        correlationId: correlationId || '',
        causationId: null,
        data: {
          productId,
          inventory: inventoryData
        },
        metadata: {
          source: 'product-service',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      await productEventsQueue.add(EventTypes.INVENTORY_UPDATED, event, {
        priority: 2, // Higher priority for inventory updates
        delay: 0
      });

      logger.info('Inventory updated event published', {
        eventId: event.eventId,
        productId,
        inventory: inventoryData
      });
    } catch (error) {
      logger.error('Failed to publish inventory updated event', {
        productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Close the queue connection
   */
  static async close(): Promise<void> {
    await productEventsQueue.close();
  }
}

export { productEventsQueue };
