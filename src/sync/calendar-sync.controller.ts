import { Body, Controller, Post } from '@nestjs/common';
import { CalendarSyncService } from './calendar-sync.service';
import { TriggerSyncDto } from './dto/trigger-sync.dto';

@Controller('sync/calendar')
export class CalendarSyncController {
  constructor(private readonly calendarSyncService: CalendarSyncService) {}

  @Post()
  triggerSync(@Body() body: TriggerSyncDto) {
    return this.calendarSyncService.syncAppointments(body.reason ?? 'manual-api');
  }
}
