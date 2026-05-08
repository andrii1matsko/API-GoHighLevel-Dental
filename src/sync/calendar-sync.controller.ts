import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalendarSyncService } from './calendar-sync.service';
import { TriggerSyncDto } from './dto/trigger-sync.dto';
import { SyncHistoryQueryDto } from './dto/sync-history-query.dto';

@ApiTags('Sync')
@Controller('sync')
export class CalendarSyncController {
  constructor(private readonly calendarSyncService: CalendarSyncService) {}

  @Post('calendar')
  @ApiOperation({ summary: 'Manually trigger appointment sync' })
  triggerSync(@Body() body: TriggerSyncDto) {
    return this.calendarSyncService.syncAppointments(body.reason ?? 'manual-api');
  }

  @Get('status')
  @ApiOperation({
    summary: 'Summary of pending/completed/failed syncs',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 150,
        pending: 3,
        success: 140,
        failed: 7,
        byDirection: {
          GHL_TO_LEYR: { pending: 1, success: 80, failed: 4 },
          LEYR_TO_GHL: { pending: 2, success: 60, failed: 3 },
        },
        queriedAt: '2026-06-15T12:00:00.000Z',
      },
    },
  })
  getSyncStatus() {
    return this.calendarSyncService.getSyncStatus();
  }

  @Get('history')
  @ApiOperation({
    summary: 'Paginated, filterable sync log',
  })
  @ApiOkResponse({
    schema: {
      example: {
        data: [
          {
            id: 'sync-row-id',
            direction: 'GHL_TO_LEYR',
            status: 'success',
            sourceSystem: 'GHL:AppointmentCreate',
            sourceExternalId: 'ghl-123',
            targetSystem: 'LEYR',
            targetExternalId: 'leyr-456',
            errorMessage: null,
            retryCount: 0,
            syncedAt: '2026-06-15T12:00:00.000Z',
            createdAt: '2026-06-15T11:55:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 150, totalPages: 8 },
      },
    },
  })
  getSyncHistory(@Query() query: SyncHistoryQueryDto) {
    return this.calendarSyncService.getSyncHistory(query);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Aggregate health metrics: success rate, latency, last sync',
  })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'healthy',
        allTime: {
          total: 150,
          success: 140,
          failed: 7,
          pending: 3,
          successRate: 93.33,
        },
        lastHour: { total: 5, success: 5, failed: 0, successRate: 100 },
        last24Hours: {
          total: 42,
          success: 40,
          failed: 2,
          successRate: 95.24,
        },
        lastSuccessfulSync: '2026-06-15T11:58:00.000Z',
        oldestPendingAge: { ms: 120000, human: '2m 0s' },
        recentFailures: [],
        queriedAt: '2026-06-15T12:00:00.000Z',
      },
    },
  })
  getSyncHealth() {
    return this.calendarSyncService.getSyncHealth();
  }
}
