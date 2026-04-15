import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { LayerApiModule } from './integrations/layer/layer-api.module';
import { GohighlevelModule } from './integrations/gohighlevel/gohighlevel.module';
import { PrismaModule } from './prisma/prisma.module';
import { CalendarSyncModule } from './sync/calendar-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    LayerApiModule,
    GohighlevelModule,
    PrismaModule,
    CalendarSyncModule,
  ],
})
export class AppModule {}
