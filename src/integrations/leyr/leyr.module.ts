import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeyrController } from './leyr.controller';
import { LeyrService } from './leyr.service';
import { LeyrMockService } from './leyr-mock.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [LeyrController],
  providers: [
    {
      provide: LeyrService,
      useFactory: (
        httpService: HttpService,
        configService: ConfigService,
        prismaService: PrismaService,
      ) => {
        const useMock =
          configService.get<string>('USE_MOCK_INTEGRATIONS', 'false') === 'true';
        if (useMock) {
          return new LeyrMockService(prismaService);
        }
        return new LeyrService(httpService, configService, prismaService);
      },
      inject: [HttpService, ConfigService, PrismaService],
    },
  ],
  exports: [LeyrService],
})
export class LeyrModule {}
