import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LeyrController } from './leyr.controller';
import { LeyrService } from './leyr.service';

@Module({
  imports: [HttpModule],
  controllers: [LeyrController],
  providers: [LeyrService],
  exports: [LeyrService],
})
export class LeyrModule {}
