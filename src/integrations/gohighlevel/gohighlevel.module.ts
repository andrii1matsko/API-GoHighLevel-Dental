import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GohighlevelController } from './gohighlevel.controller';
import { GohighlevelService } from './gohighlevel.service';

@Module({
  imports: [HttpModule],
  controllers: [GohighlevelController],
  providers: [GohighlevelService],
  exports: [GohighlevelService],
})
export class GohighlevelModule {}
