import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';
import { HealthCheckResponse } from './health.interface';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(@Res() res: Response) {
    const healthResult: HealthCheckResponse = await this.healthService.check();

    if (healthResult.status === 'error') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(healthResult);
    }

    return res.status(HttpStatus.OK).json(healthResult);
  }
}
