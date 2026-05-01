import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return process.env.AUDIT_LOG_ENABLED !== 'false';
  }

  async record(data: Prisma.AuditLogCreateInput): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (!process.env.DATABASE_URL) {
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Audit log persistence failed: ${message}`);
    }
  }
}
