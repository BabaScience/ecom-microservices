export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  uptime: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

