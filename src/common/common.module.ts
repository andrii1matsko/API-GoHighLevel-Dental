import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { ObservabilityInterceptor } from './interceptors/observability.interceptor';
import { AuditLogService } from './services/audit-log.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me-in-env',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuditLogService,
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class CommonModule {}
