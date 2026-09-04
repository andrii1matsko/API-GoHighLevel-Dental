import { Module, forwardRef } from '@nestjs/common';
import { GohighlevelModule } from '../integrations/gohighlevel/gohighlevel.module';
import { LeyrModule } from '../integrations/leyr/leyr.module';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';
import { LeyrPollingService } from './leyr-polling.service';
import { IdentityResolverService } from './identity-resolver.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';
import { MappingsController } from './mappings.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [forwardRef(() => GohighlevelModule), LeyrModule],
  controllers: [CalendarSyncController, MappingsController],
  providers: [
    CalendarSyncService,
    LeyrPollingService,
    IdentityResolverService,
    ServiceMappingResolverService,
    AvailabilityService,
  ],
  exports: [
    CalendarSyncService,
    IdentityResolverService,
    ServiceMappingResolverService,
    AvailabilityService,
  ],
})
export class CalendarSyncModule {}
