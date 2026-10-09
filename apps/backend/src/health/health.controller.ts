import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@ApiExcludeController()
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' } | { status: 'error'; checks: { database: 'down' } }> {
    const healthy = await this.healthService.isDatabaseReady();
    if (healthy) {
      return { status: 'ok' };
    }

    response.status(503);
    return { status: 'error', checks: { database: 'down' } };
  }
}
