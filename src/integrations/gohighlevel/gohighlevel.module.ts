import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GohighlevelController } from './gohighlevel.controller';
import { GohighlevelService } from './gohighlevel.service';
import { GohighlevelMockService } from './gohighlevel-mock.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [HttpModule],
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
