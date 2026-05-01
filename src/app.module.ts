import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { LeyrModule } from './integrations/leyr/leyr.module';
import { GohighlevelModule } from './integrations/gohighlevel/gohighlevel.module';
import { PrismaModule } from './prisma/prisma.module';
import { CalendarSyncModule } from './sync/calendar-sync.module';
import { AuthModule } from './auth/auth.module';
import { MasterDataModule } from './master-data/master-data.module';
import { CommonModule } from './common/common.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    HealthModule,
    LeyrModule,
    GohighlevelModule,
    PrismaModule,
    CalendarSyncModule,
    AuthModule,
    MasterDataModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
