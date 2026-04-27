import { Module } from '@nestjs/common';
import { GohighlevelModule } from '../integrations/gohighlevel/gohighlevel.module';
import { LeyrModule } from '../integrations/leyr/leyr.module';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [GohighlevelModule, LeyrModule],
  controllers: [CalendarSyncController],
  providers: [CalendarSyncService],
})
export class CalendarSyncModule {}
