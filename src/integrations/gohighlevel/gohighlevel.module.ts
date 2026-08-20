import { HttpModule, HttpService } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncModule } from '../../sync/calendar-sync.module';
import { GohighlevelController } from './gohighlevel.controller';
import { GohighlevelService } from './gohighlevel.service';
import { GohighlevelMockService } from './gohighlevel-mock.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [HttpModule, forwardRef(() => CalendarSyncModule)],
  controllers: [GohighlevelController],
  providers: [
    {
      provide: GohighlevelService,
      useFactory: (
        httpService: HttpService,
        configService: ConfigService,
        prismaService: PrismaService,
      ) => {
        const useMock =
          configService.get<string>('USE_MOCK_INTEGRATIONS', 'false') === 'true';
        if (useMock) {
          return new GohighlevelMockService(prismaService);
        }
        return new GohighlevelService(httpService, configService, prismaService);
      },
      inject: [HttpService, ConfigService, PrismaService],
    },
  ],
  exports: [GohighlevelService],
})
export class GohighlevelModule {}
