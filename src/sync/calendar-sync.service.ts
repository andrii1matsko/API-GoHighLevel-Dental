import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LayerApiService } from '../integrations/layer/layer-api.service';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly layerApiService: LayerApiService,
    private readonly gohighlevelService: GohighlevelService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleScheduledSync() {
    await this.syncAppointments('scheduled-job');
  }

  async syncAppointments(trigger: string) {
    this.logger.log(`Starting calendar sync (${trigger})`);

    const appointments = await this.layerApiService.getUpcomingAppointments();

    for (const appointment of appointments) {
      await this.gohighlevelService.upsertAppointment(appointment);
    }

    const result = {
      trigger,
      syncedCount: appointments.length,
      completedAt: new Date().toISOString(),
    };

    this.logger.log(
      `Calendar sync completed (${trigger}) with ${appointments.length} appointment(s)`,
    );

    return result;
  }
}
