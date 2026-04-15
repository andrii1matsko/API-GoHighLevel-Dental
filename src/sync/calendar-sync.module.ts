import { Module } from '@nestjs/common';
import { GohighlevelModule } from '../integrations/gohighlevel/gohighlevel.module';
import { LayerApiModule } from '../integrations/layer/layer-api.module';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [LayerApiModule, GohighlevelModule],
  controllers: [CalendarSyncController],
  providers: [CalendarSyncService],
})
export class CalendarSyncModule {}
