import { ApiResponse, ErrorResponse } from '../types';

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

export function error(code: string, message: string, details?: Record<string, unknown>): ErrorResponse {
  return { success: false, error: { code, message, details }, timestamp: new Date().toISOString() };
}

