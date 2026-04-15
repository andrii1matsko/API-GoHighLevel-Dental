import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      service: 'Opus Dental API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
