export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  services: {
    database: {
      status: 'up' | 'down';
      latency?: number;
    };
    redis: {
      status: 'up' | 'down';
      latency?: number;
    };
  };
}
