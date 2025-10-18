import { logger, eventPublisher, EventTypes, DomainEvent } from '@repo/shared';
import { OrderSaga, SagaStep, SagaStatus, createOrderSaga } from './orderSaga';
import { compensationService } from './compensations';

export interface SagaOrchestratorConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export class SagaOrchestrator {
  private config: SagaOrchestratorConfig;
  private activeSagas: Map<string, OrderSaga> = new Map();
  
  constructor(config: SagaOrchestratorConfig = {
    timeoutMs: 300000, // 5 minutes
    maxRetries: 3,
    retryDelayMs: 5000
  }) {
    this.config = config;
  }
  
  async startOrderSaga(orderId: string): Promise<void> {
    logger.info('Starting order saga', { orderId });
    
    try {
      const saga = createOrderSaga(orderId);
      await saga.initialize();
      
      // Move to first step
      await saga.moveToStep(SagaStep.ORDER_CREATED);
      
      // Store active saga
      this.activeSagas.set(orderId, saga);
      
      // Set timeout for saga completion
      this.setSagaTimeout(orderId);
      
      logger.info('Order saga started', { 
        orderId,
        sagaId: saga['order'].saga.id 
      });
      
    } catch (error) {
      logger.error('Failed to start order saga', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async handleInventoryReserved(orderId: string): Promise<void> {
    logger.info('Handling inventory reserved event', { orderId });
    
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }
    
    try {
      // Check if we can move to payment processing
      const canMove = await saga.canMoveToStep(SagaStep.PAYMENT_PROCESSING);
      if (!canMove) {
        logger.warn('Cannot move to payment processing step', { orderId });
        return;
      }
      
      // Move to payment processing step
      await saga.moveToStep(SagaStep.PAYMENT_PROCESSING);
      
      // Publish payment request event (this would trigger payment processing)
      await this.publishPaymentRequestEvent(orderId);
      
      logger.info('Moved to payment processing', { orderId });
      
    } catch (error) {
      logger.error('Failed to handle inventory reserved', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await this.handleSagaFailure(orderId, 'Failed to process inventory reservation');
    }
  }
  
  async handleInventoryInsufficient(orderId: string, reason: string): Promise<void> {
    logger.info('Handling inventory insufficient event', { orderId, reason });
    
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }
    
    await this.handleSagaFailure(orderId, `Insufficient inventory: ${reason}`);
  }
  
  async handlePaymentProcessed(orderId: string): Promise<void> {
    logger.info('Handling payment processed event', { orderId });
    
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }
    
    try {
      // Check if we can move to order confirmed
      const canMove = await saga.canMoveToStep(SagaStep.ORDER_CONFIRMED);
      if (!canMove) {
        logger.warn('Cannot move to order confirmed step', { orderId });
        return;
      }
      
      // Move to order confirmed step
      await saga.moveToStep(SagaStep.ORDER_CONFIRMED);
      
      // Complete the saga
      await saga.completeSaga();
      
      // Publish order confirmed event
      await this.publishOrderConfirmedEvent(orderId);
      
      // Remove from active sagas
      this.activeSagas.delete(orderId);
      
      logger.info('Order saga completed successfully', { orderId });
      
    } catch (error) {
      logger.error('Failed to handle payment processed', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await this.handleSagaFailure(orderId, 'Failed to process payment');
    }
  }
  
  async handlePaymentFailed(orderId: string, reason: string): Promise<void> {
    logger.info('Handling payment failed event', { orderId, reason });
    
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }
    
    await this.handleSagaFailure(orderId, `Payment failed: ${reason}`);
  }
  
  private async handleSagaFailure(orderId: string, reason: string): Promise<void> {
    logger.error('Handling saga failure', { orderId, reason });
    
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      logger.warn('No active saga found for order', { orderId });
      return;
    }
    
    try {
      // Execute compensations
      await compensationService.executeFullCompensation(saga);
      
      // Fail the saga
      await saga.failSaga(reason);
      
      // Publish order failed event
      await this.publishOrderFailedEvent(orderId, reason);
      
      // Remove from active sagas
      this.activeSagas.delete(orderId);
      
      logger.info('Saga failure handled', { orderId, reason });
      
    } catch (error) {
      logger.error('Failed to handle saga failure', {
        orderId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  private async publishPaymentRequestEvent(orderId: string): Promise<void> {
    const event: DomainEvent<any> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.ORDER_PAYMENT_PROCESSING,
      aggregateId: orderId,
      aggregateType: 'Order',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        action: 'process_payment'
      },
      metadata: {
        source: 'order-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishOrderEvent(event);
  }
  
  private async publishOrderConfirmedEvent(orderId: string): Promise<void> {
    const event: DomainEvent<any> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.ORDER_CONFIRMED,
      aggregateId: orderId,
      aggregateType: 'Order',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        status: 'confirmed'
      },
      metadata: {
        source: 'order-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishOrderEvent(event);
  }
  
  private async publishOrderFailedEvent(orderId: string, reason: string): Promise<void> {
    const event: DomainEvent<any> = {
      eventId: crypto.randomUUID(),
      eventType: EventTypes.ORDER_FAILED,
      aggregateId: orderId,
      aggregateType: 'Order',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: crypto.randomUUID(),
      causationId: null,
      data: {
        orderId,
        reason,
        status: 'failed'
      },
      metadata: {
        source: 'order-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishOrderEvent(event);
  }
  
  private setSagaTimeout(orderId: string): void {
    setTimeout(async () => {
      const saga = this.activeSagas.get(orderId);
      if (saga) {
        logger.warn('Saga timeout reached', { orderId });
        await this.handleSagaFailure(orderId, 'Saga timeout exceeded');
      }
    }, this.config.timeoutMs);
  }
  
  async getActiveSagas(): Promise<string[]> {
    return Array.from(this.activeSagas.keys());
  }
  
  async getSagaStatus(orderId: string): Promise<SagaStatus | null> {
    const saga = this.activeSagas.get(orderId);
    if (!saga) {
      return null;
    }
    
    const state = await saga.getCurrentState();
    return state.status;
  }
}

export const sagaOrchestrator = new SagaOrchestrator();
