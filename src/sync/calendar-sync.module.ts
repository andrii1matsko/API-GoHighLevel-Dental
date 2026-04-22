import { Module } from '@nestjs/common';
import { GohighlevelModule } from '../integrations/gohighlevel/gohighlevel.module';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [GohighlevelModule],
  controllers: [CalendarSyncController],
  providers: [CalendarSyncService],
})
export class CalendarSyncModule {}
