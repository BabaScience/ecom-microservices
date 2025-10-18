import { InventoryReservation } from '../models/InventoryReservation';
import { productServiceClient, Product } from './productServiceClient';
import { eventPublisher, EventTypes, DomainEvent, InventoryReservedData, InventoryReleasedData, InventoryInsufficientData } from '@repo/shared';
import { logger } from '@repo/shared';

export interface ReservationRequest {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface ReservationResult {
  success: boolean;
  reservedItems: Array<{
    productId: string;
    quantity: number;
  }>;
  failedItems: Array<{
    productId: string;
    reason: string;
  }>;
}

export class InventoryService {
  private readonly RESERVATION_TIMEOUT_MINUTES = 15;
  
  async reserveInventory(request: ReservationRequest): Promise<ReservationResult> {
    const { orderId, items } = request;
    const reservedItems: Array<{ productId: string; quantity: number }> = [];
    const failedItems: Array<{ productId: string; reason: string }> = [];
    
    logger.info('Starting inventory reservation', { orderId, itemCount: items.length });
    
    // Check availability for all items first
    for (const item of items) {
      const product = await productServiceClient.getProduct(item.productId);
      
      if (!product) {
        failedItems.push({
          productId: item.productId,
          reason: 'Product not found'
        });
        continue;
      }
      
      if (product.status !== 'active') {
        failedItems.push({
          productId: item.productId,
          reason: `Product is ${product.status}`
        });
        continue;
      }
      
      if (product.inventory.available < item.quantity) {
        failedItems.push({
          productId: item.productId,
          reason: `Insufficient inventory. Available: ${product.inventory.available}, Requested: ${item.quantity}`
        });
        continue;
      }
    }
    
    // If any items failed availability check, don't reserve anything
    if (failedItems.length > 0) {
      logger.warn('Inventory reservation failed - insufficient availability', { 
        orderId, 
        failedItems 
      });
      
      // Publish insufficient inventory event
      await this.publishInsufficientInventoryEvent(orderId, failedItems);
      
      return {
        success: false,
        reservedItems: [],
        failedItems
      };
    }
    
    // Reserve inventory for all items
    const expiresAt = new Date(Date.now() + this.RESERVATION_TIMEOUT_MINUTES * 60 * 1000);
    
    for (const item of items) {
      try {
        // Create reservation record
        await InventoryReservation.create({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          status: 'reserved',
          expiresAt
        });
        
        // Update product inventory
        await productServiceClient.updateProductInventory(item.productId, {
          available: -item.quantity,
          reserved: item.quantity
        });
        
        reservedItems.push({
          productId: item.productId,
          quantity: item.quantity
        });
        
        logger.info('Inventory reserved', { 
          orderId, 
          productId: item.productId, 
          quantity: item.quantity 
        });
      } catch (error) {
        logger.error('Failed to reserve inventory for item', { 
          orderId, 
          productId: item.productId, 
          quantity: item.quantity,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        failedItems.push({
          productId: item.productId,
          reason: 'Reservation failed'
        });
      }
    }
    
    if (reservedItems.length > 0) {
      // Publish inventory reserved event
      await this.publishInventoryReservedEvent(orderId, reservedItems);
    }
    
    return {
      success: reservedItems.length === items.length,
      reservedItems,
      failedItems
    };
  }
  
  async releaseInventory(orderId: string): Promise<void> {
    logger.info('Releasing inventory for order', { orderId });
    
    const reservations = await InventoryReservation.find({ 
      orderId, 
      status: 'reserved' 
    });
    
    if (reservations.length === 0) {
      logger.warn('No active reservations found for order', { orderId });
      return;
    }
    
    const releasedItems: Array<{ productId: string; quantity: number }> = [];
    
    for (const reservation of reservations) {
      try {
        // Update reservation status
        reservation.status = 'released';
        reservation.releasedAt = new Date();
        await reservation.save();
        
        // Update product inventory
        await productServiceClient.updateProductInventory(reservation.productId, {
          available: reservation.quantity,
          reserved: -reservation.quantity
        });
        
        releasedItems.push({
          productId: reservation.productId,
          quantity: reservation.quantity
        });
        
        logger.info('Inventory released', { 
          orderId, 
          productId: reservation.productId, 
          quantity: reservation.quantity 
        });
      } catch (error) {
        logger.error('Failed to release inventory', { 
          orderId, 
          productId: reservation.productId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    if (releasedItems.length > 0) {
      // Publish inventory released event
      await this.publishInventoryReleasedEvent(orderId, releasedItems);
    }
  }
  
  async expireReservations(): Promise<void> {
    const now = new Date();
    const expiredReservations = await InventoryReservation.find({
      status: 'reserved',
      expiresAt: { $lt: now }
    });
    
    if (expiredReservations.length === 0) {
      return;
    }
    
    logger.info('Processing expired reservations', { count: expiredReservations.length });
    
    for (const reservation of expiredReservations) {
      try {
        // Update reservation status
        reservation.status = 'expired';
        await reservation.save();
        
        // Release inventory back to available
        await productServiceClient.updateProductInventory(reservation.productId, {
          available: reservation.quantity,
          reserved: -reservation.quantity
        });
        
        logger.info('Expired reservation processed', { 
          orderId: reservation.orderId, 
          productId: reservation.productId 
        });
      } catch (error) {
        logger.error('Failed to process expired reservation', { 
          orderId: reservation.orderId,
          productId: reservation.productId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  private async publishInventoryReservedEvent(
    orderId: string, 
    items: Array<{ productId: string; quantity: number }>
  ): Promise<void> {
    const event: DomainEvent<InventoryReservedData> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.INVENTORY_RESERVED,
      aggregateId: orderId,
      aggregateType: 'Inventory',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        items
      },
      metadata: {
        source: 'inventory-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishInventoryEvent(event);
  }
  
  private async publishInventoryReleasedEvent(
    orderId: string, 
    items: Array<{ productId: string; quantity: number }>
  ): Promise<void> {
    const event: DomainEvent<InventoryReleasedData> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.INVENTORY_RELEASED,
      aggregateId: orderId,
      aggregateType: 'Inventory',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        items
      },
      metadata: {
        source: 'inventory-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishInventoryEvent(event);
  }
  
  private async publishInsufficientInventoryEvent(
    orderId: string, 
    failedItems: Array<{ productId: string; reason: string }>
  ): Promise<void> {
    const event: DomainEvent<InventoryInsufficientData> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.INVENTORY_INSUFFICIENT,
      aggregateId: orderId,
      aggregateType: 'Inventory',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        failedItems
      },
      metadata: {
        source: 'inventory-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishInventoryEvent(event);
  }
}

export const inventoryService = new InventoryService();
