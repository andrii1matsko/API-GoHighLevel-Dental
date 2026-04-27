import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { CreateAppointmentDto } from '../integrations/gohighlevel/dto/calendars.dto';
import { CreateLeyrAppointmentDto } from '../integrations/leyr/dto/create-appointment.dto';

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
