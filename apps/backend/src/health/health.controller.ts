import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get('live')
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
