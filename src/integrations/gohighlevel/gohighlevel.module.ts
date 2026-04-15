import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GohighlevelService } from './gohighlevel.service';

@Module({
  imports: [HttpModule],
  providers: [GohighlevelService],
  exports: [GohighlevelService],
})
export class GohighlevelModule {}
