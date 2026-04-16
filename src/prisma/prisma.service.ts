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

    try {
      await this.$connect();
      this.connected = true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown Prisma error';
      this.logger.warn(
        `Prisma connection failed; continuing without DB connection. ${message}`,
      );
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (!this.connected) {
      return;
    }

    await this.$disconnect();
  }
}
