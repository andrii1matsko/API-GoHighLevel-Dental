import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn(
        'DATABASE_URL not set; Prisma connection is disabled until DB is configured',
      );
      return;
    }

    await this.$connect();
    this.connected = true;
  }

  async onModuleDestroy() {
    if (!this.connected) {
      return;
    }

    await this.$disconnect();
  }
}
