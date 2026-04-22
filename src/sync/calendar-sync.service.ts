import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor() {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleScheduledSync() {
    await this.syncAppointments('scheduled-job');
  }

  async syncAppointments(trigger: string) {
    this.logger.log(
      `Skipping calendar sync (${trigger}): Layer integration has been removed`,
    );

    const result = {
      trigger,
      syncedCount: 0,
      skipped: true,
      completedAt: new Date().toISOString(),
    };

    return result;
  }
}
