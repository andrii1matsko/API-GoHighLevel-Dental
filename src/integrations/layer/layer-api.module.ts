import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LayerApiService } from './layer-api.service';

@Module({
  imports: [HttpModule],
  providers: [LayerApiService],
  exports: [LayerApiService],
})
export class LayerApiModule {}
