import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { CreateAppointmentDto } from '../integrations/gohighlevel/dto/calendars.dto';
import { CreateLeyrAppointmentDto } from '../integrations/leyr/dto/create-appointment.dto';
import { SyncHistoryQueryDto } from './dto/sync-history-query.dto';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);
  private readonly defaultLeyrEmr: string;
  private readonly defaultLeyrCareUnitId: string;
  private readonly defaultLeyrHealthcareServiceId: string;
  private readonly defaultLeyrResourceId: string;
  private readonly defaultGhlContactId: string;
  private readonly defaultGhlLocationId: string;
  private readonly defaultGhlCalendarId: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly gohighlevelService: GohighlevelService,
    private readonly leyrService: LeyrService,
    private readonly configService: ConfigService,
  ) {
    this.defaultLeyrEmr = this.configService.get<string>('LEYR_EMR', 'opus');
    this.defaultLeyrCareUnitId = this.configService.get<string>(
      'SYNC_LEYR_DEFAULT_CARE_UNIT_ID',
      '',
    );
    this.defaultLeyrHealthcareServiceId = this.configService.get<string>(
      'SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID',
      '',
    );
    this.defaultLeyrResourceId = this.configService.get<string>(
      'SYNC_LEYR_DEFAULT_RESOURCE_ID',
      '',
    );
    this.defaultGhlContactId = this.configService.get<string>(
      'SYNC_GHL_DEFAULT_CONTACT_ID',
      '',
    );
    this.defaultGhlLocationId = this.configService.get<string>(
      'SYNC_GHL_DEFAULT_LOCATION_ID',
      this.configService.get<string>(
        'GHL_LOCATION_ID_OAUTH',
        this.configService.get<string>('GHL_LOCATION_ID', ''),
      ),
    );
    this.defaultGhlCalendarId = this.configService.get<string>(
      'SYNC_GHL_DEFAULT_CALENDAR_ID',
      this.configService.get<string>('GHL_CALENDAR_ID', ''),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleScheduledSync() {
    await this.syncAppointments('scheduled-job');
  }

  async getSyncStatus() {
    const [pending, success, failed, total] = await Promise.all([
      this.prismaService.appointmentSync.count({ where: { status: 'pending' } }),
      this.prismaService.appointmentSync.count({ where: { status: 'success' } }),
      this.prismaService.appointmentSync.count({ where: { status: 'failed' } }),
      this.prismaService.appointmentSync.count(),
    ]);

    const byDirection = await this.prismaService.appointmentSync.groupBy({
      by: ['direction', 'status'],
      _count: true,
    });

    const directionBreakdown: Record<
      string,
      Record<string, number>
    > = {};
    for (const row of byDirection) {
      directionBreakdown[row.direction] ??= {};
      directionBreakdown[row.direction][row.status] = row._count;
    }

    return {
      total,
      pending,
      success,
      failed,
      byDirection: directionBreakdown,
      queriedAt: new Date().toISOString(),
    };
  }

  async getSyncHistory(query: SyncHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentSyncWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;
    if (query.sourceSystem) where.sourceSystem = { contains: query.sourceSystem };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [rows, total] = await Promise.all([
      this.prismaService.appointmentSync.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          direction: true,
          status: true,
          sourceSystem: true,
          sourceExternalId: true,
          targetSystem: true,
          targetExternalId: true,
          idempotencyKey: true,
          errorMessage: true,
          retryCount: true,
          syncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prismaService.appointmentSync.count({ where }),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSyncHealth() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalAll,
      successAll,
      failedAll,
      pendingAll,
      lastHourTotal,
      lastHourSuccess,
      lastHourFailed,
      last24hTotal,
      last24hSuccess,
      last24hFailed,
      lastSync,
      oldestPending,
      recentFailures,
    ] = await Promise.all([
      this.prismaService.appointmentSync.count(),
      this.prismaService.appointmentSync.count({ where: { status: 'success' } }),
      this.prismaService.appointmentSync.count({ where: { status: 'failed' } }),
      this.prismaService.appointmentSync.count({ where: { status: 'pending' } }),
      this.prismaService.appointmentSync.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),
      this.prismaService.appointmentSync.count({
        where: { status: 'success', createdAt: { gte: oneHourAgo } },
      }),
      this.prismaService.appointmentSync.count({
        where: { status: 'failed', createdAt: { gte: oneHourAgo } },
      }),
      this.prismaService.appointmentSync.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prismaService.appointmentSync.count({
        where: { status: 'success', createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prismaService.appointmentSync.count({
        where: { status: 'failed', createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prismaService.appointmentSync.findFirst({
        where: { syncedAt: { not: null } },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true, direction: true, status: true },
      }),
      this.prismaService.appointmentSync.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prismaService.appointmentSync.findMany({
        where: { status: 'failed', createdAt: { gte: twentyFourHoursAgo } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          direction: true,
          sourceSystem: true,
          sourceExternalId: true,
          errorMessage: true,
          retryCount: true,
          createdAt: true,
        },
      }),
    ]);

    const allTimeSuccessRate =
      totalAll > 0 ? Math.round((successAll / totalAll) * 10000) / 100 : 0;
    const lastHourSuccessRate =
      lastHourTotal > 0
        ? Math.round((lastHourSuccess / lastHourTotal) * 10000) / 100
        : null;
    const last24hSuccessRate =
      last24hTotal > 0
        ? Math.round((last24hSuccess / last24hTotal) * 10000) / 100
        : null;

    const pendingAgeMs = oldestPending?.createdAt
      ? now.getTime() - oldestPending.createdAt.getTime()
      : null;

    return {
      status: failedAll === 0 && pendingAll < 50 ? 'healthy' : pendingAll >= 50 ? 'degraded' : 'warning',
      allTime: {
        total: totalAll,
        success: successAll,
        failed: failedAll,
        pending: pendingAll,
        successRate: allTimeSuccessRate,
      },
      lastHour: {
        total: lastHourTotal,
        success: lastHourSuccess,
        failed: lastHourFailed,
        successRate: lastHourSuccessRate,
      },
      last24Hours: {
        total: last24hTotal,
        success: last24hSuccess,
        failed: last24hFailed,
        successRate: last24hSuccessRate,
      },
      lastSuccessfulSync: lastSync?.syncedAt?.toISOString() ?? null,
      oldestPendingAge: pendingAgeMs !== null
        ? {
            ms: pendingAgeMs,
            human: humanizeDuration(pendingAgeMs),
          }
        : null,
      recentFailures,
      queriedAt: now.toISOString(),
    };
  }

  async syncAppointments(trigger: string) {
    const pendingRows = await this.prismaService.appointmentSync.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 30,
      include: {
        ghlAppointment: true,
        leyrAppointment: true,
      },
    });

    let syncedCount = 0;
    let failedCount = 0;

    for (const row of pendingRows) {
      try {
        if (row.direction === 'GHL_TO_LEYR') {
          await this.processGhlToLeyr(row.id);
        } else if (row.direction === 'LEYR_TO_GHL') {
          await this.processLeyrToGhl(row.id);
        } else {
          throw new Error(`Unsupported sync direction: ${row.direction}`);
        }
        syncedCount += 1;
      } catch (error) {
        failedCount += 1;
        const message =
          error instanceof Error ? error.message : 'Unknown sync error';
        this.logger.warn(`Sync row ${row.id} failed: ${message}`);
      }
    }

    return {
      trigger,
      pendingFound: pendingRows.length,
      syncedCount,
      failedCount,
      completedAt: new Date().toISOString(),
    };
  }

  private async markRowFailed(rowId: string, errorMessage: string) {
    await this.prismaService.appointmentSync.update({
      where: { id: rowId },
      data: {
        status: 'failed',
        errorMessage,
        retryCount: {
          increment: 1,
        },
      },
    });
  }

  private async processGhlToLeyr(rowId: string) {
    const row = await this.prismaService.appointmentSync.findUnique({
      where: { id: rowId },
      include: { ghlAppointment: true },
    });

    if (!row || !row.ghlAppointment) {
      await this.markRowFailed(rowId, 'Missing GHL appointment payload');
      return;
    }

    const mutationType =
      typeof row.sourceSystem === 'string' && row.sourceSystem.includes(':')
        ? row.sourceSystem.split(':')[1]
        : 'AppointmentCreate';

    if (mutationType === 'AppointmentUpdate' || mutationType === 'AppointmentDelete') {
      await this.markRowFailed(
        rowId,
        `Leyr sync for ${mutationType} not implemented yet (will avoid creating duplicates).`,
      );
      return;
    }

    if (
      !this.defaultLeyrCareUnitId ||
      !this.defaultLeyrHealthcareServiceId ||
      !this.defaultLeyrResourceId
    ) {
      await this.markRowFailed(
        rowId,
        'Missing SYNC_LEYR_DEFAULT_CARE_UNIT_ID / SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID / SYNC_LEYR_DEFAULT_RESOURCE_ID',
      );
      return;
    }

    if (!row.ghlAppointment.startAt || !row.ghlAppointment.endAt) {
      await this.markRowFailed(rowId, 'GHL appointment missing start/end time');
      return;
    }

    const payload: CreateLeyrAppointmentDto = {
      start: row.ghlAppointment.startAt.toISOString(),
      end: row.ghlAppointment.endAt.toISOString(),
      healthcare_service_id: this.defaultLeyrHealthcareServiceId,
      resource_id: this.defaultLeyrResourceId,
      patient_id: row.ghlAppointment.contactId,
      comment:
        row.ghlAppointment.title ?? `Synced from GHL ${row.sourceExternalId}`,
    };

    const response = (await this.leyrService.createAppointment(
      this.defaultLeyrCareUnitId,
      payload,
      this.defaultLeyrEmr,
      { enqueueSync: false },
    )) as Array<Record<string, unknown>>;

    const leyrId = response?.[0]?.id ? String(response[0].id) : null;
    if (!leyrId) {
      await this.markRowFailed(rowId, 'Leyr create appointment returned no id');
      return;
    }

    const leyrDb = await this.prismaService.leyrAppointment.findUnique({
      where: { leyrAppointmentId: leyrId },
      select: { id: true },
    });

    await this.prismaService.appointmentSync.update({
      where: { id: rowId },
      data: {
        status: 'success',
        targetExternalId: leyrId,
        syncedAt: new Date(),
        errorMessage: null,
        leyrAppointmentId: leyrDb?.id ?? null,
      },
    });
  }

  private async processLeyrToGhl(rowId: string) {
    const row = await this.prismaService.appointmentSync.findUnique({
      where: { id: rowId },
      include: { leyrAppointment: true },
    });

    if (!row || !row.leyrAppointment) {
      await this.markRowFailed(rowId, 'Missing Leyr appointment payload');
      return;
    }

    if (
      !this.defaultGhlContactId ||
      !this.defaultGhlLocationId ||
      !this.defaultGhlCalendarId
    ) {
      await this.markRowFailed(
        rowId,
        'Missing SYNC_GHL_DEFAULT_CONTACT_ID / SYNC_GHL_DEFAULT_LOCATION_ID / SYNC_GHL_DEFAULT_CALENDAR_ID',
      );
      return;
    }

    const payload: CreateAppointmentDto = {
      contactId: this.defaultGhlContactId,
      locationId: this.defaultGhlLocationId,
      calendarId: this.defaultGhlCalendarId,
      startTime: row.leyrAppointment.startAt.toISOString(),
      endTime: row.leyrAppointment.endAt.toISOString(),
      title:
        row.leyrAppointment.description ??
        row.leyrAppointment.comment ??
        `Synced from Leyr ${row.sourceExternalId}`,
      appointmentStatus: 'confirmed',
    };

    const response = (await this.gohighlevelService.createAppointment(payload, {
      enqueueSync: false,
    })) as Record<string, unknown>;
    const ghlId = response?.id ? String(response.id) : null;
    if (!ghlId) {
      await this.markRowFailed(rowId, 'GHL create appointment returned no id');
      return;
    }

    const ghlDb = await this.prismaService.ghlAppointment.findUnique({
      where: { ghlAppointmentId: ghlId },
      select: { id: true },
    });

    await this.prismaService.appointmentSync.update({
      where: { id: rowId },
      data: {
        status: 'success',
        targetExternalId: ghlId,
        syncedAt: new Date(),
        errorMessage: null,
        ghlAppointmentId: ghlDb?.id ?? null,
      },
    });
  }
}

function humanizeDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
