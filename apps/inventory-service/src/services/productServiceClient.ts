import axios from 'axios';
import { logger } from '@repo/shared';

export interface Product {
  _id: string;
  name: string;
  sku: string;
  price: {
    amount: number;
    currency: string;
  };
  inventory: {
    total: number;
    available: number;
    reserved: number;
  };
  status: 'active' | 'inactive' | 'discontinued';
}

export class ProductServiceClient {
  private baseURL: string;
  private timeout: number = 5000;
  
  constructor() {
    this.baseURL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
  }
  
  async getProduct(productId: string): Promise<Product | null> {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/products/${productId}`,
        {
          timeout: this.timeout,
          headers: {
            'X-Service-Name': 'inventory-service'
          }
        }
      );
      
      if (response.data.success) {
        return response.data.data.product;
      }
      
      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          logger.warn('Product not found', { productId });
          return null;
        }
        logger.error('Product service error', { 
          productId, 
          error: error.message 
        });
      }
      throw new Error(`Failed to fetch product ${productId}: ${error}`);
    }
  }
  
  async updateProductInventory(
    productId: string, 
    updates: {
      available?: number;
      reserved?: number;
    }
  ): Promise<void> {
    try {
      await axios.patch(
        `${this.baseURL}/api/products/${productId}/inventory`,
        updates,
        {
          timeout: this.timeout,
          headers: {
            'X-Service-Name': 'inventory-service'
          }
        }
      );
      
      logger.info('Product inventory updated', { productId, updates });
    } catch (error) {
      logger.error('Failed to update product inventory', { 
        productId, 
        updates, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async checkProductAvailability(productId: string, quantity: number): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/products/${productId}/check-availability`,
        { quantity },
        {
          timeout: this.timeout,
          headers: {
            'X-Service-Name': 'inventory-service'
          }
        }
      );
      
      return response.data.success && response.data.data.available;
    } catch (error) {
      logger.error('Failed to check product availability', { 
        productId, 
        quantity, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

export const productServiceClient = new ProductServiceClient();
