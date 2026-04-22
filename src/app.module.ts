import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { LeyrModule } from './integrations/leyr/leyr.module';
import { GohighlevelModule } from './integrations/gohighlevel/gohighlevel.module';
import { PrismaModule } from './prisma/prisma.module';
import { CalendarSyncModule } from './sync/calendar-sync.module';
import { AuthModule } from './auth/auth.module';
import { MasterDataModule } from './master-data/master-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    LeyrModule,
    GohighlevelModule,
    PrismaModule,
    CalendarSyncModule,
    AuthModule,
    MasterDataModule,
  ],
})
export class AppModule {}
