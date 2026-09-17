import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { HealthCheckResponse } from './health.interface';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  async check(): Promise<HealthCheckResponse> {
    const response: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    };

    // Check Database
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      response.services.database = {
        status: 'up',
        latency: Date.now() - dbStart,
      };
    } catch {
      response.status = 'error';
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const pingResult = await this.redisClient.ping();
      if (pingResult === 'PONG') {
        response.services.redis = {
          status: 'up',
          latency: Date.now() - redisStart,
        };
      } else {
        response.status = 'error';
      }
    } catch {
      response.status = 'error';
    }

    return response;
  }
}
