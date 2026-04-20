import { Module } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { CareUnitsController } from './care-units.controller';
import { HealthServicesController } from './health-services.controller';
import { ResourcesController } from './resources.controller';

@Module({
  controllers: [CareUnitsController, HealthServicesController, ResourcesController],
  providers: [MasterDataService],
})
export class MasterDataModule {}
