import { logger } from '@repo/shared';
import { OrderSaga, SagaStep, SagaStatus } from './orderSaga';

export interface CompensationAction {
  step: SagaStep;
  action: () => Promise<void>;
  description: string;
}

export class CompensationService {
  private compensations: Map<SagaStep, () => Promise<void>> = new Map();
  
  constructor() {
    this.registerCompensations();
  }
  
  private registerCompensations(): void {
    // Register compensation for inventory reservation
    this.compensations.set(SagaStep.INVENTORY_RESERVED, async () => {
      logger.info('Compensating inventory reservation');
      // This will be handled by the inventory service when it receives order.cancelled event
      // The actual compensation logic is in the inventory service
    });
    
    // Register compensation for payment processing
    this.compensations.set(SagaStep.PAYMENT_PROCESSING, async () => {
      logger.info('Compensating payment processing');
      // This would typically involve calling a payment service to refund
      // For now, we'll just log it
    });
  }
  
  async executeCompensation(saga: OrderSaga, step: SagaStep): Promise<void> {
    const compensation = this.compensations.get(step);
    
    if (!compensation) {
      logger.warn('No compensation registered for step', { step });
      return;
    }
    
    try {
      logger.info('Executing compensation', { 
        orderId: saga['orderId'], 
        step 
      });
      
      await compensation();
      
      await saga.compensateStep(step, 'Compensation executed successfully');
      
      logger.info('Compensation completed', { 
        orderId: saga['orderId'], 
        step 
      });
    } catch (error) {
      logger.error('Compensation failed', { 
        orderId: saga['orderId'], 
        step,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }
  
  async executeFullCompensation(saga: OrderSaga): Promise<void> {
    const compensationSteps = await saga.getCompensationSteps();
    
    logger.info('Starting full compensation', {
      orderId: saga['orderId'],
      steps: compensationSteps
    });
    
    // Execute compensations in reverse order
    for (const step of compensationSteps.reverse()) {
      try {
        await this.executeCompensation(saga, step);
      } catch (error) {
        logger.error('Failed to compensate step', {
          orderId: saga['orderId'],
          step,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other compensations even if one fails
      }
    }
    
    logger.info('Full compensation completed', {
      orderId: saga['orderId']
    });
  }
}

export const compensationService = new CompensationService();
