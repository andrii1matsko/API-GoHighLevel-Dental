import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GhlAppointment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { IdentityResolverService } from './identity-resolver.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';
import {
  mapGhlToLeyrPayload,
  mapLeyrToGhlPayload,
  mapLeyrToGhlUpdatePayload,
  mapGhlStatusToLeyr,
} from './appointment-mapper';
import { SyncHistoryQueryDto } from './dto/sync-history-query.dto';
import { CreateBlockSlotDto } from '../integrations/gohighlevel/dto/calendars.dto';

const MAX_RETRIES = 5;

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);
  private readonly maxRetries: number;
  private readonly echoGuardSeconds: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly gohighlevelService: GohighlevelService,
    private readonly leyrService: LeyrService,
    private readonly configService: ConfigService,
    private readonly identityResolver: IdentityResolverService,
    private readonly serviceMappingResolver: ServiceMappingResolverService,
  ) {
    this.maxRetries = this.configService.get<number>(
      'SYNC_MAX_RETRIES',
      MAX_RETRIES,
    );
    this.echoGuardSeconds = this.configService.get<number>(
      'SYNC_ECHO_GUARD_SECONDS',
      60,
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleScheduledSync() {
    await this.syncAppointments('scheduled-job');
  }

  async getSyncStatus() {
    const [pending, success, failed, total] = await Promise.all([
      this.prismaService.appointmentSync.count({
        where: { status: 'pending' },
      }),
      this.prismaService.appointmentSync.count({
        where: { status: 'success' },
      }),
      this.prismaService.appointmentSync.count({ where: { status: 'failed' } }),
      this.prismaService.appointmentSync.count(),
    ]);

    const byDirection = await this.prismaService.appointmentSync.groupBy({
      by: ['direction', 'status'],
      _count: true,
    });

    const directionBreakdown: Record<string, Record<string, number>> = {};
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
    if (query.sourceSystem)
      where.sourceSystem = { contains: query.sourceSystem };
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
      this.prismaService.appointmentSync.count({
        where: { status: 'success' },
      }),
      this.prismaService.appointmentSync.count({ where: { status: 'failed' } }),
      this.prismaService.appointmentSync.count({
        where: { status: 'pending' },
      }),
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
      status:
        failedAll === 0 && pendingAll < 50
          ? 'healthy'
          : pendingAll >= 50
            ? 'degraded'
            : 'warning',
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
      oldestPendingAge:
        pendingAgeMs !== null
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
    const now = new Date();
    const staleProcessingBefore = new Date(now.getTime() - 5 * 60 * 1000);
    const pendingRows = await this.prismaService.appointmentSync.findMany({
      where: {
        OR: [
          {
            status: { in: ['pending', 'failed'] },
            AND: [
              {
                OR: [
                  { nextRetryAfter: null },
                  { nextRetryAfter: { lte: now } },
                ],
              },
            ],
          },
          {
            // Recover rows claimed by a crashed worker
            status: 'processing',
            updatedAt: { lte: staleProcessingBefore },
          },
        ],
      },
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
      const claimed = await this.prismaService.appointmentSync.updateMany({
        where: {
          id: row.id,
          status: { in: ['pending', 'failed', 'processing'] },
        },
        data: { status: 'processing' },
      });
      if (claimed.count === 0) {
        continue;
      }

      try {
        let success = false;
        if (row.direction === 'GHL_TO_LEYR') {
          success = await this.processGhlToLeyr(row.id);
        } else if (row.direction === 'LEYR_TO_GHL') {
          success = await this.processLeyrToGhl(row.id);
        } else {
          await this.markRowFailed(
            row.id,
            `Unsupported sync direction: ${row.direction}`,
          );
        }

        if (success) {
          syncedCount += 1;
        } else {
          failedCount += 1;
          // Safety: never leave a claimed row stuck in `processing`
          const current = await this.prismaService.appointmentSync.findUnique({
            where: { id: row.id },
            select: { status: true },
          });
          if (current?.status === 'processing') {
            await this.markRowFailed(
              row.id,
              'Sync returned failure without updating row status',
            );
          }
        }
      } catch (error) {
        failedCount += 1;
        let message =
          error instanceof Error ? error.message : 'Unknown sync error';

        // Extract detailed response from HttpException (e.g. Leyr validation errors)
        if (error && typeof error === 'object' && 'getResponse' in error) {
          try {
            const resp = (
              error as { getResponse: () => unknown }
            ).getResponse();
            const details =
              typeof resp === 'string' ? resp : JSON.stringify(resp);
            message = `${message} | Details: ${details}`;
          } catch {
            /* ignore serialization errors */
          }
        }

        this.logger.warn(`Sync row ${row.id} threw: ${message}`);
        await this.markRowFailed(row.id, message);
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
    const row = await this.prismaService.appointmentSync.findUnique({
      where: { id: rowId },
      select: { retryCount: true },
    });

    const newRetryCount = (row?.retryCount ?? 0) + 1;
    const isDeadLetter = newRetryCount >= this.maxRetries;

    const backoffMs = Math.min(
      1000 * Math.pow(2, newRetryCount),
      30 * 60 * 1000,
    );

    await this.prismaService.appointmentSync.update({
      where: { id: rowId },
      data: {
        // Keep retryable rows as `failed` (not pending) for metrics, but
        // syncAppointments selects both pending+failed with nextRetryAfter.
        status: isDeadLetter ? 'dead_letter' : 'failed',
        errorMessage,
        retryCount: newRetryCount,
        nextRetryAfter: isDeadLetter ? null : new Date(Date.now() + backoffMs),
      },
    });

    if (isDeadLetter) {
      this.logger.error(
        `Sync row ${rowId} moved to dead_letter after ${newRetryCount} retries: ${errorMessage}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Block Slot helpers
  // ---------------------------------------------------------------------------

  private async createGhlBlockSlot(opts: {
    calendarId: string;
    locationId: string;
    assignedUserId?: string | null;
    startTime: string;
    endTime: string;
    title?: string;
  }): Promise<string | null> {
    const payload: CreateBlockSlotDto = {
      calendarId: opts.assignedUserId ? undefined : opts.calendarId,
      assignedUserId: opts.assignedUserId || undefined,
      locationId: opts.locationId,
      startTime: opts.startTime,
      endTime: opts.endTime,
      title: opts.title ?? 'Blocked (synced appointment)',
    };

    try {
      const res = (await this.gohighlevelService.createBlockSlot(
        payload,
      )) as Record<string, unknown>;
      const slotId = res?.id ? String(res.id) : null;
      if (slotId) {
        this.logger.log(`Created GHL block slot ${slotId}`);
      }
      return slotId;
    } catch (err) {
      this.logger.warn(
        `Block slot creation failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async updateGhlBlockSlot(
    blockSlotId: string,
    opts: {
      calendarId?: string;
      locationId?: string;
      assignedUserId?: string | null;
      startTime?: string;
      endTime?: string;
      title?: string;
    },
  ): Promise<void> {
    try {
      await this.gohighlevelService.updateBlockSlot(blockSlotId, {
        calendarId: opts.assignedUserId ? undefined : opts.calendarId,
        assignedUserId: opts.assignedUserId || undefined,
        locationId: opts.locationId,
        startTime: opts.startTime,
        endTime: opts.endTime,
        title: opts.title,
      });
      this.logger.log(`Updated GHL block slot ${blockSlotId}`);
    } catch (err) {
      this.logger.warn(
        `Block slot update failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async deleteGhlBlockSlot(blockSlotId: string): Promise<void> {
    try {
      await this.gohighlevelService.deleteEvent(blockSlotId, {});
      this.logger.log(`Deleted GHL block slot ${blockSlotId}`);
    } catch (err) {
      this.logger.warn(
        `Block slot deletion failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // GHL → Leyr
  // ---------------------------------------------------------------------------

  private async processGhlToLeyr(rowId: string): Promise<boolean> {
    const row = await this.prismaService.appointmentSync.findUnique({
      where: { id: rowId },
      include: { ghlAppointment: true },
    });

    if (!row || !row.ghlAppointment) {
      await this.markRowFailed(rowId, 'Missing GHL appointment payload');
      return false;
    }

    const mutationType =
      typeof row.sourceSystem === 'string' && row.sourceSystem.includes(':')
        ? row.sourceSystem.split(':')[1]
        : 'AppointmentCreate';

    if (mutationType === 'AppointmentUpdate') {
      return this.processGhlToLeyrUpdate(rowId, row.ghlAppointment);
    }
    if (mutationType === 'AppointmentDelete') {
      return this.processGhlToLeyrDelete(rowId, row.ghlAppointment);
    }

    // Duplicate guard: if an AppointmentLink already exists, this was already synced
    const existingLink = await this.prismaService.appointmentLink.findFirst({
      where: { ghlAppointmentId: row.ghlAppointment.ghlAppointmentId },
    });
    if (existingLink) {
      await this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: existingLink.leyrAppointmentId,
          syncedAt: new Date(),
          errorMessage: null,
        },
      });
      return true;
    }

    if (!row.ghlAppointment.startAt || !row.ghlAppointment.endAt) {
      await this.markRowFailed(rowId, 'GHL appointment missing start/end time');
      return false;
    }

    // 1. Resolve identity: GHL contact → Leyr patient
    const identity = await this.identityResolver.resolveLeyrPatient(
      row.ghlAppointment.contactId,
      row.ghlAppointment.locationId,
    );

    // 2. Resolve service mapping: GHL calendar + staff → Leyr targets
    const leyrTarget = await this.serviceMappingResolver.resolveLeyrTarget(
      row.ghlAppointment.calendarId,
      row.ghlAppointment.assignedUserId,
    );

    if (!leyrTarget.careUnitId || !leyrTarget.healthcareServiceId) {
      await this.markRowFailed(
        rowId,
        'Service mapping resolved to empty careUnitId or healthcareServiceId — configure FacilityMapping + CalendarServiceMapping or set env defaults',
      );
      return false;
    }

    // 3. Build mapped payload
    const mapped = mapGhlToLeyrPayload({
      ghlAppointment: row.ghlAppointment,
      leyrPatientId: identity.leyrPatientId,
      leyrTarget,
    });

    // 4. Create appointment in Leyr
    const response = (await this.leyrService.createAppointment(
      mapped.careUnitId,
      mapped.payload,
      mapped.emr,
      { enqueueSync: false },
    )) as Array<Record<string, unknown>>;

    const leyrId = response?.[0]?.id ? String(response[0].id) : null;
    if (!leyrId) {
      await this.markRowFailed(rowId, 'Leyr create appointment returned no id');
      return false;
    }

    // 5. Create a GHL block slot for this appointment's time window
    const blockSlotId = await this.createGhlBlockSlot({
      calendarId: row.ghlAppointment.calendarId,
      locationId: row.ghlAppointment.locationId,
      assignedUserId: row.ghlAppointment.assignedUserId,
      startTime: row.ghlAppointment.startAt.toISOString(),
      endTime: row.ghlAppointment.endAt.toISOString(),
      title: row.ghlAppointment.title ?? 'Blocked (synced appointment)',
    });

    // 6. Create link + mark success atomically
    const leyrDb = await this.prismaService.leyrAppointment.findUnique({
      where: { leyrAppointmentId: leyrId },
      select: { id: true },
    });

    const echoGuardUntil = new Date(Date.now() + this.echoGuardSeconds * 1000);

    await this.prismaService.$transaction([
      this.prismaService.appointmentLink.create({
        data: {
          ghlAppointmentId: row.ghlAppointment.ghlAppointmentId,
          leyrAppointmentId: leyrId,
          leyrEmr: mapped.emr,
          leyrCareUnitId: mapped.careUnitId,
          ghlBlockSlotId: blockSlotId,
          lastSyncDirection: 'GHL_TO_LEYR',
          lastSyncedAt: new Date(),
          echoGuardUntil,
        },
      }),
      this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: leyrId,
          syncedAt: new Date(),
          errorMessage: null,
          leyrAppointmentId: leyrDb?.id ?? null,
        },
      }),
    ]);

    this.logger.log(
      `Synced GHL ${row.ghlAppointment.ghlAppointmentId} → Leyr ${leyrId} (block slot: ${blockSlotId ?? 'none'})`,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Leyr → GHL
  // ---------------------------------------------------------------------------

  private async processLeyrToGhl(rowId: string): Promise<boolean> {
    const row = await this.prismaService.appointmentSync.findUnique({
      where: { id: rowId },
      include: { leyrAppointment: true },
    });

    if (!row || !row.leyrAppointment) {
      await this.markRowFailed(rowId, 'Missing Leyr appointment payload');
      return false;
    }

    // Route updates and cancellations to dedicated handlers
    const leyrMutationType =
      typeof row.sourceSystem === 'string' && row.sourceSystem.includes(':')
        ? row.sourceSystem.split(':')[1]
        : 'AppointmentCreate';

    if (
      leyrMutationType === 'AppointmentUpdate' ||
      leyrMutationType === 'AppointmentCancel'
    ) {
      return this.processLeyrToGhlUpdate(
        rowId,
        row.leyrAppointment.leyrAppointmentId,
      );
    }

    // Duplicate guard
    const existingLink = await this.prismaService.appointmentLink.findFirst({
      where: { leyrAppointmentId: row.leyrAppointment.leyrAppointmentId },
    });
    if (existingLink) {
      await this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: existingLink.ghlAppointmentId,
          syncedAt: new Date(),
          errorMessage: null,
        },
      });
      return true;
    }

    // 1. Resolve identity: Leyr patient → GHL contact.
    // Pass the patient participant's name as a fallback in case getPatient
    // is unavailable/fails for this EMR.
    const participants = Array.isArray(row.leyrAppointment.participants)
      ? (row.leyrAppointment.participants as Array<{
          role?: string;
          name?: string;
        }>)
      : [];
    const patientName =
      participants.find((p) => p?.role === 'patient')?.name?.trim() ?? '';
    const [fallbackFirstName, ...fallbackRest] = patientName.split(/\s+/);
    const identity = await this.identityResolver.resolveGhlContact(
      row.leyrAppointment.patientId,
      row.leyrAppointment.emr,
      row.leyrAppointment.careUnitId,
      patientName
        ? {
            firstName: fallbackFirstName ?? null,
            lastName: fallbackRest.join(' ') || null,
          }
        : undefined,
    );

    // 2. Resolve service mapping: Leyr service + resource → GHL targets
    const ghlTarget = await this.serviceMappingResolver.resolveGhlTarget(
      row.leyrAppointment.careUnitId,
      row.leyrAppointment.emr,
      row.leyrAppointment.healthcareServiceId,
      row.leyrAppointment.resourceId,
    );

    if (!ghlTarget.calendarId) {
      await this.markRowFailed(
        rowId,
        'Service mapping resolved to empty calendarId — configure CalendarServiceMapping or set SYNC_GHL_DEFAULT_CALENDAR_ID',
      );
      return false;
    }

    // 3. Build mapped payload
    const payload = mapLeyrToGhlPayload({
      leyrAppointment: row.leyrAppointment,
      ghlContactId: identity.ghlContactId,
      ghlLocationId: identity.ghlLocationId,
      ghlTarget,
      sourceExternalId: row.sourceExternalId,
    });

    // 4. Create appointment in GHL
    const response = (await this.gohighlevelService.createAppointment(payload, {
      enqueueSync: false,
    })) as Record<string, unknown>;

    const ghlId = response?.id ? String(response.id) : null;
    if (!ghlId) {
      await this.markRowFailed(rowId, 'GHL create appointment returned no id');
      return false;
    }

    // 5. Create a GHL block slot for this appointment's time window
    const blockSlotId = await this.createGhlBlockSlot({
      calendarId: ghlTarget.calendarId,
      locationId: ghlTarget.locationId || identity.ghlLocationId,
      assignedUserId: ghlTarget.assignedUserId,
      startTime: row.leyrAppointment.startAt.toISOString(),
      endTime: row.leyrAppointment.endAt.toISOString(),
      title: row.leyrAppointment.description ?? 'Blocked (synced appointment)',
    });

    // 6. Create link + mark success atomically
    const ghlDb = await this.prismaService.ghlAppointment.findUnique({
      where: { ghlAppointmentId: ghlId },
      select: { id: true },
    });

    const echoGuardUntil = new Date(Date.now() + this.echoGuardSeconds * 1000);

    await this.prismaService.$transaction([
      this.prismaService.appointmentLink.create({
        data: {
          ghlAppointmentId: ghlId,
          leyrAppointmentId: row.leyrAppointment.leyrAppointmentId,
          leyrEmr: row.leyrAppointment.emr,
          leyrCareUnitId: row.leyrAppointment.careUnitId,
          ghlBlockSlotId: blockSlotId,
          lastSyncDirection: 'LEYR_TO_GHL',
          lastSyncedAt: new Date(),
          echoGuardUntil,
        },
      }),
      this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: ghlId,
          syncedAt: new Date(),
          errorMessage: null,
          ghlAppointmentId: ghlDb?.id ?? null,
        },
      }),
    ]);

    this.logger.log(
      `Synced Leyr ${row.leyrAppointment.leyrAppointmentId} → GHL ${ghlId} (block slot: ${blockSlotId ?? 'none'})`,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // GHL → Leyr UPDATE (cancel + recreate, since Leyr has no PATCH endpoint)
  // ---------------------------------------------------------------------------

  private async processGhlToLeyrUpdate(
    rowId: string,
    ghlAppointment: GhlAppointment | null,
  ): Promise<boolean> {
    if (!ghlAppointment) {
      await this.markRowFailed(rowId, 'Missing GHL appointment for update');
      return false;
    }

    const link = await this.prismaService.appointmentLink.findFirst({
      where: { ghlAppointmentId: ghlAppointment.ghlAppointmentId },
    });

    if (!link) {
      this.logger.warn(
        `GHL update for ${ghlAppointment.ghlAppointmentId} has no AppointmentLink — treating as new create`,
      );
      await this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          sourceSystem: 'GHL:AppointmentCreate',
          status: 'processing',
          errorMessage: null,
          nextRetryAfter: null,
        },
      });
      return this.processGhlToLeyr(rowId);
    }

    if (!ghlAppointment.startAt || !ghlAppointment.endAt) {
      await this.markRowFailed(
        rowId,
        'GHL appointment missing start/end time for update',
      );
      return false;
    }

    const leyrTarget = await this.serviceMappingResolver.resolveLeyrTarget(
      ghlAppointment.calendarId,
      ghlAppointment.assignedUserId,
    );

    if (!leyrTarget.careUnitId || !leyrTarget.healthcareServiceId) {
      await this.markRowFailed(rowId, 'Service mapping incomplete for update');
      return false;
    }

    // Use Leyr PATCH endpoint to update the existing appointment
    const leyrStatus = mapGhlStatusToLeyr(ghlAppointment.status);
    const isCancelled = leyrStatus === 'cancelled';

    await this.leyrService.updateAppointment(
      link.leyrAppointmentId,
      leyrTarget.careUnitId,
      {
        status: leyrStatus,
        start: isCancelled ? undefined : ghlAppointment.startAt.toISOString(),
        end: isCancelled ? undefined : ghlAppointment.endAt.toISOString(),
        healthcare_service_id: isCancelled
          ? undefined
          : leyrTarget.healthcareServiceId,
        resource_id: isCancelled ? undefined : leyrTarget.resourceId,
        comment: isCancelled ? undefined : ghlAppointment.title || undefined,
      },
      leyrTarget.emr,
    );

    // Update or recreate the GHL block slot
    let newBlockSlotId = link.ghlBlockSlotId;
    if (isCancelled && link.ghlBlockSlotId) {
      await this.deleteGhlBlockSlot(link.ghlBlockSlotId);
      newBlockSlotId = null;
    } else if (link.ghlBlockSlotId) {
      await this.updateGhlBlockSlot(link.ghlBlockSlotId, {
        calendarId: ghlAppointment.calendarId,
        locationId: ghlAppointment.locationId,
        assignedUserId: ghlAppointment.assignedUserId,
        startTime: ghlAppointment.startAt.toISOString(),
        endTime: ghlAppointment.endAt.toISOString(),
        title: ghlAppointment.title ?? 'Blocked (synced appointment)',
      });
    } else {
      newBlockSlotId = await this.createGhlBlockSlot({
        calendarId: ghlAppointment.calendarId,
        locationId: ghlAppointment.locationId,
        assignedUserId: ghlAppointment.assignedUserId,
        startTime: ghlAppointment.startAt.toISOString(),
        endTime: ghlAppointment.endAt.toISOString(),
        title: ghlAppointment.title ?? 'Blocked (synced appointment)',
      });
    }

    const echoGuardUntil = new Date(Date.now() + this.echoGuardSeconds * 1000);

    await this.prismaService.$transaction([
      this.prismaService.appointmentLink.update({
        where: { id: link.id },
        data: {
          ghlBlockSlotId: newBlockSlotId,
          lastSyncDirection: 'GHL_TO_LEYR',
          lastSyncedAt: new Date(),
          echoGuardUntil,
        },
      }),
      this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: link.leyrAppointmentId,
          syncedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);

    this.logger.log(
      `Updated GHL ${ghlAppointment.ghlAppointmentId} → Leyr ${link.leyrAppointmentId} via PATCH`,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // GHL → Leyr DELETE
  // ---------------------------------------------------------------------------

  private async processGhlToLeyrDelete(
    rowId: string,
    ghlAppointment: GhlAppointment | null,
  ): Promise<boolean> {
    if (!ghlAppointment) {
      await this.markRowFailed(rowId, 'Missing GHL appointment for delete');
      return false;
    }

    const link = await this.prismaService.appointmentLink.findFirst({
      where: { ghlAppointmentId: ghlAppointment.ghlAppointmentId },
    });

    if (!link) {
      // Nothing was ever synced — just mark success and move on
      await this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          syncedAt: new Date(),
          errorMessage: null,
        },
      });
      this.logger.log(
        `GHL delete for ${ghlAppointment.ghlAppointmentId} — no AppointmentLink, nothing to cancel`,
      );
      return true;
    }

    // Cancel the Leyr appointment via PATCH status=cancelled
    try {
      await this.leyrService.updateAppointment(
        link.leyrAppointmentId,
        link.leyrCareUnitId,
        { status: 'cancelled' },
        link.leyrEmr,
      );
      this.logger.log(
        `Cancelled Leyr appointment ${link.leyrAppointmentId} via PATCH`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Leyr cancel failed';
      this.logger.warn(`Leyr cancel failed: ${message}`);
      await this.markRowFailed(
        rowId,
        `Leyr cancel failed — keeping AppointmentLink for retry: ${message}`,
      );
      return false;
    }

    // Delete the associated GHL block slot if one exists
    if (link.ghlBlockSlotId) {
      await this.deleteGhlBlockSlot(link.ghlBlockSlotId);
    }

    // Also update local DB status
    const leyrDb = await this.prismaService.leyrAppointment.findUnique({
      where: { leyrAppointmentId: link.leyrAppointmentId },
    });

    await this.prismaService.$transaction([
      ...(leyrDb
        ? [
            this.prismaService.leyrAppointment.update({
              where: { id: leyrDb.id },
              data: { status: 'cancelled' },
            }),
          ]
        : []),
      this.prismaService.appointmentLink.delete({
        where: { id: link.id },
      }),
      this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: link.leyrAppointmentId,
          syncedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);

    this.logger.log(
      `Deleted GHL ${ghlAppointment.ghlAppointmentId} → cancelled Leyr ${link.leyrAppointmentId}`,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Leyr → GHL UPDATE (uses GHL's PUT endpoint directly)
  // ---------------------------------------------------------------------------

  private async processLeyrToGhlUpdate(
    rowId: string,
    leyrAppointmentId: string,
  ): Promise<boolean> {
    const link = await this.prismaService.appointmentLink.findFirst({
      where: { leyrAppointmentId },
    });

    if (!link) {
      const row = await this.prismaService.appointmentSync.findUnique({
        where: { id: rowId },
        select: { sourceSystem: true },
      });
      const mutationType =
        typeof row?.sourceSystem === 'string' && row.sourceSystem.includes(':')
          ? row.sourceSystem.split(':')[1]
          : 'AppointmentUpdate';

      if (mutationType === 'AppointmentCancel') {
        await this.markRowFailed(
          rowId,
          'No AppointmentLink for Leyr cancel — nothing to delete in GHL',
        );
        return false;
      }

      this.logger.warn(
        `Leyr update for ${leyrAppointmentId} has no AppointmentLink — treating as new create`,
      );
      await this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          sourceSystem: 'LEYR:AppointmentCreate',
          status: 'processing',
          errorMessage: null,
          nextRetryAfter: null,
        },
      });
      return this.processLeyrToGhl(rowId);
    }

    const leyrAppointment = await this.prismaService.leyrAppointment.findUnique(
      {
        where: { leyrAppointmentId },
      },
    );

    if (!leyrAppointment) {
      await this.markRowFailed(
        rowId,
        'Leyr appointment record not found for update',
      );
      return false;
    }

    // Resolve staff mapping for assignedUserId
    const ghlTarget = await this.serviceMappingResolver.resolveGhlTarget(
      leyrAppointment.careUnitId,
      leyrAppointment.emr,
      leyrAppointment.healthcareServiceId,
      leyrAppointment.resourceId,
    );

    const updatePayload = mapLeyrToGhlUpdatePayload({
      leyrAppointment,
      ghlTarget,
    });

    // If the Leyr status is cancelled, propagate as cancellation
    if (leyrAppointment.status === 'cancelled') {
      updatePayload.appointmentStatus = 'cancelled';
    }

    await this.gohighlevelService.updateAppointment(
      link.ghlAppointmentId,
      updatePayload,
    );

    // Update or create the GHL block slot to match the new times
    let newBlockSlotId = link.ghlBlockSlotId;
    if (leyrAppointment.status === 'cancelled' && link.ghlBlockSlotId) {
      await this.deleteGhlBlockSlot(link.ghlBlockSlotId);
      newBlockSlotId = null;
    } else if (link.ghlBlockSlotId) {
      await this.updateGhlBlockSlot(link.ghlBlockSlotId, {
        calendarId: ghlTarget.calendarId || undefined,
        locationId: ghlTarget.locationId || undefined,
        assignedUserId: ghlTarget.assignedUserId,
        startTime: leyrAppointment.startAt.toISOString(),
        endTime: leyrAppointment.endAt.toISOString(),
      });
    } else {
      newBlockSlotId = await this.createGhlBlockSlot({
        calendarId: ghlTarget.calendarId,
        locationId: ghlTarget.locationId || '',
        assignedUserId: ghlTarget.assignedUserId,
        startTime: leyrAppointment.startAt.toISOString(),
        endTime: leyrAppointment.endAt.toISOString(),
        title: leyrAppointment.description ?? 'Blocked (synced appointment)',
      });
    }

    const echoGuardUntil = new Date(Date.now() + this.echoGuardSeconds * 1000);

    await this.prismaService.$transaction([
      this.prismaService.appointmentLink.update({
        where: { id: link.id },
        data: {
          ghlBlockSlotId: newBlockSlotId,
          lastSyncDirection: 'LEYR_TO_GHL',
          lastSyncedAt: new Date(),
          echoGuardUntil,
        },
      }),
      this.prismaService.appointmentSync.update({
        where: { id: rowId },
        data: {
          status: 'success',
          targetExternalId: link.ghlAppointmentId,
          syncedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);

    this.logger.log(
      `Updated Leyr ${leyrAppointmentId} → GHL ${link.ghlAppointmentId}`,
    );
    return true;
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
