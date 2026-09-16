import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CalendarSyncService } from './calendar-sync.service';
import { LeyrPollingService } from './leyr-polling.service';
import { AvailabilityService } from './availability.service';
import { GhlAvailabilitySyncService } from './ghl-availability-sync.service';
import { TriggerSyncDto } from './dto/trigger-sync.dto';
import { PollLeyrDto } from './dto/poll-leyr.dto';
import { SyncHistoryQueryDto } from './dto/sync-history-query.dto';
import { LeyrBackedFreeSlotsQueryDto } from './dto/leyr-backed-free-slots-query.dto';
import { PushAvailabilityDto } from './dto/push-availability.dto';

@ApiTags('Sync')
@Controller('sync')
export class CalendarSyncController {
  constructor(
    private readonly calendarSyncService: CalendarSyncService,
    private readonly leyrPollingService: LeyrPollingService,
    private readonly availabilityService: AvailabilityService,
    private readonly ghlAvailabilitySyncService: GhlAvailabilitySyncService,
  ) {}

  @Get('calendars/:calendarId/free-slots')
  @ApiOperation({
    summary: 'Free slots from Leyr/Muntra/Opus for a mapped GHL calendar',
    description:
      'Returns the same shape as GHL free-slots, but sourced from Leyr timeslots. ' +
      'Use this for booking UIs: GHL service_booking free-slots ignore staff busy blocks from Muntra.',
  })
  @ApiParam({ name: 'calendarId', description: 'GHL calendar ID' })
  @ApiOkResponse({
    schema: {
      example: {
        '2026-09-11': {
          slots: ['2026-09-11T09:40:00+02:00'],
        },
      },
    },
  })
  getLeyrBackedFreeSlots(
    @Param('calendarId') calendarId: string,
    @Query() query: LeyrBackedFreeSlotsQueryDto,
  ) {
    return this.availabilityService.getLeyrBackedFreeSlots({
      ghlCalendarId: calendarId,
      startDateMs: query.startDate,
      endDateMs: query.endDate,
      timezone: query.timezone,
      ghlUserId: query.userId,
    });
  }

  @Post('availability/push')
  @ApiOperation({
    summary:
      'Push Leyr/Muntra free timeslots into GHL Date-specific hours (native widget)',
    description:
      'Updates a dedicated staff schedule per calendar (never stomps Work Hours). ' +
      'Optional body: ghlLocationId / ghlCalendarId. Env allow-lists: ' +
      'SYNC_GHL_AVAILABILITY_LOCATION_IDS, SYNC_GHL_AVAILABILITY_CALENDAR_IDS. ' +
      'Requires SYNC_GHL_AVAILABILITY_SYNC_ENABLED=true. Refuses to write if any free slot would be dropped.',
  })
  pushAvailabilityToGhl(@Body() body: PushAvailabilityDto) {
    return this.ghlAvailabilitySyncService.syncAll('manual-api', {
      ghlLocationId: body.ghlLocationId,
      ghlCalendarId: body.ghlCalendarId,
    });
  }

  @Get('availability/inspect')
  @ApiOperation({
    summary: 'Inspect GHL staff schedules for Muntra availability debugging',
    description:
      'Returns all schedules for a user and sample date-specific rules. ' +
      'Use to verify Work Hours leftovers are not hiding afternoon slots.',
  })
  inspectAvailability(
    @Query('locationId') locationId: string,
    @Query('userId') userId: string,
    @Query('calendarId') calendarId: string,
    @Query('dates') dates?: string,
  ) {
    const sampleDates = dates
      ? dates
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['2026-09-17', '2026-09-18'];
    return this.ghlAvailabilitySyncService.inspectStaffAvailability({
      locationId,
      userId,
      calendarId,
      sampleDates,
    });
  }

  @Post('calendar')
  @ApiOperation({
    summary: 'Manually trigger appointment sync',
    description:
      'Use reason "repair-busy-blocks" to recreate Leyr→GHL busy mirrors as calendar-level blocks on every facility calendar (fixes booking widgets that ignore user-only blocks).',
  })
  triggerSync(@Body() body: TriggerSyncDto) {
    return this.calendarSyncService.syncAppointments(
      body.reason ?? 'manual-api',
    );
  }

  @Post('poll-leyr')
  @ApiOperation({
    summary: 'Manually trigger Leyr appointment polling',
    description:
      'Polls Leyr for appointment changes. If careUnitId is provided, polls only that clinic. Otherwise polls all enabled clinics.',
  })
  pollLeyr(@Body() body: PollLeyrDto) {
    if (body.careUnitId) {
      return this.leyrPollingService.pollSingleClinic(body.careUnitId);
    }
    return this.leyrPollingService.pollAllClinics('manual-api');
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
