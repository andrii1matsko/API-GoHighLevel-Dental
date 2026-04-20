import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      service: 'Opus Dental API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  async checkDb() {
    try {
      const usersCount = await this.prisma.user.count();
      return {
        service: 'Opus Dental API',
        database: 'ok',
        usersCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';
      throw new ServiceUnavailableException({
        service: 'Opus Dental API',
        database: 'down',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
