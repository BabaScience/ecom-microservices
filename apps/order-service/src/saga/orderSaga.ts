import { Order } from '../models/Order';
import { logger } from '@repo/shared';

export enum SagaStep {
  ORDER_CREATED = 'order_created',
  INVENTORY_RESERVED = 'inventory_reserved',
  PAYMENT_PROCESSING = 'payment_processing',
  PAYMENT_PROCESSED = 'payment_processed',
  ORDER_CONFIRMED = 'order_confirmed',
  ORDER_FAILED = 'order_failed',
  ORDER_CANCELLED = 'order_cancelled'
}

export enum SagaStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  COMPENSATING = 'compensating',
  FAILED = 'failed'
}

export interface SagaState {
  orderId: string;
  currentStep: SagaStep;
  status: SagaStatus;
  completedSteps: SagaStep[];
  compensatedSteps: SagaStep[];
  data?: any;
}

export class OrderSaga {
  private readonly orderId: string;
  private order: any;
  
  constructor(orderId: string) {
    this.orderId = orderId;
  }
  
  async initialize(): Promise<void> {
    this.order = await Order.findById(this.orderId);
    if (!this.order) {
      throw new Error(`Order ${this.orderId} not found`);
    }
  }
  
  async getCurrentState(): Promise<SagaState> {
    if (!this.order) {
      await this.initialize();
    }
    
    return {
      orderId: this.orderId,
      currentStep: this.order.saga.currentStep as SagaStep,
      status: this.order.saga.status as SagaStatus,
      completedSteps: this.order.saga.completedSteps as SagaStep[],
      compensatedSteps: this.order.saga.compensatedSteps as SagaStep[]
    };
  }
  
  async moveToStep(step: SagaStep, data?: any): Promise<void> {
    if (!this.order) {
      await this.initialize();
    }
    
    const currentState = await this.getCurrentState();
    
    logger.info('Moving saga to step', {
      orderId: this.orderId,
      fromStep: currentState.currentStep,
      toStep: step,
      data
    });
    
    // Update saga state
    this.order.saga.currentStep = step;
    this.order.saga.completedSteps.push(step);
    
    // Update order status based on step
    await this.updateOrderStatusForStep(step);
    
    await this.order.save();
    
    logger.info('Saga step completed', {
      orderId: this.orderId,
      step,
      status: this.order.saga.status
    });
  }
  
  async compensateStep(step: SagaStep, reason?: string): Promise<void> {
    if (!this.order) {
      await this.initialize();
    }
    
    logger.info('Compensating saga step', {
      orderId: this.orderId,
      step,
      reason
    });
    
    // Mark step as compensated
    this.order.saga.compensatedSteps.push(step);
    this.order.saga.status = SagaStatus.COMPENSATING;
    
    await this.order.save();
  }
  
  async failSaga(reason: string): Promise<void> {
    if (!this.order) {
      await this.initialize();
    }
    
    logger.error('Saga failed', {
      orderId: this.orderId,
      reason,
      currentStep: this.order.saga.currentStep
    });
    
    this.order.saga.status = SagaStatus.FAILED;
    this.order.status = 'failed';
    
    await this.order.save();
  }
  
  async completeSaga(): Promise<void> {
    if (!this.order) {
      await this.initialize();
    }
    
    logger.info('Saga completed', {
      orderId: this.orderId,
      completedSteps: this.order.saga.completedSteps
    });
    
    this.order.saga.status = SagaStatus.COMPLETED;
    this.order.status = 'confirmed';
    
    await this.order.save();
  }
  
  private async updateOrderStatusForStep(step: SagaStep): Promise<void> {
    switch (step) {
      case SagaStep.ORDER_CREATED:
        this.order.status = 'pending';
        break;
      case SagaStep.INVENTORY_RESERVED:
        // Stay in pending until payment processing
        break;
      case SagaStep.PAYMENT_PROCESSING:
        this.order.status = 'payment_processing';
        break;
      case SagaStep.PAYMENT_PROCESSED:
        // Will be updated to confirmed in completeSaga
        break;
      case SagaStep.ORDER_CONFIRMED:
        this.order.status = 'confirmed';
        break;
      case SagaStep.ORDER_FAILED:
        this.order.status = 'failed';
        break;
      case SagaStep.ORDER_CANCELLED:
        this.order.status = 'cancelled';
        break;
    }
  }
  
  async canMoveToStep(step: SagaStep): Promise<boolean> {
    const currentState = await this.getCurrentState();
    
    // Define valid transitions
    const validTransitions: Record<SagaStep, SagaStep[]> = {
      [SagaStep.ORDER_CREATED]: [SagaStep.INVENTORY_RESERVED, SagaStep.ORDER_FAILED],
      [SagaStep.INVENTORY_RESERVED]: [SagaStep.PAYMENT_PROCESSING, SagaStep.ORDER_CANCELLED],
      [SagaStep.PAYMENT_PROCESSING]: [SagaStep.PAYMENT_PROCESSED, SagaStep.ORDER_CANCELLED],
      [SagaStep.PAYMENT_PROCESSED]: [SagaStep.ORDER_CONFIRMED],
      [SagaStep.ORDER_CONFIRMED]: [],
      [SagaStep.ORDER_FAILED]: [],
      [SagaStep.ORDER_CANCELLED]: []
    };
    
    return validTransitions[currentState.currentStep]?.includes(step) || false;
  }
  
  async getCompensationSteps(): Promise<SagaStep[]> {
    const currentState = await this.getCurrentState();
    
    // Return steps that need compensation in reverse order
    const compensationMap: Record<SagaStep, SagaStep[]> = {
      [SagaStep.ORDER_CREATED]: [],
      [SagaStep.INVENTORY_RESERVED]: [SagaStep.INVENTORY_RESERVED],
      [SagaStep.PAYMENT_PROCESSING]: [SagaStep.INVENTORY_RESERVED],
      [SagaStep.PAYMENT_PROCESSED]: [SagaStep.INVENTORY_RESERVED],
      [SagaStep.ORDER_CONFIRMED]: [],
      [SagaStep.ORDER_FAILED]: [],
      [SagaStep.ORDER_CANCELLED]: []
    };
    
    return compensationMap[currentState.currentStep] || [];
  }
}

export const createOrderSaga = (orderId: string): OrderSaga => {
  return new OrderSaga(orderId);
};
