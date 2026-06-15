import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LeyrService } from '../integrations/leyr/leyr.service';

interface LeyrApiAppointment {
  id?: string;
  emr_id?: string;
  start?: string;
  end?: string;
  status?: string;
  description?: string;
  comment?: string;
  care_unit_id?: string;
  participants?: Array<{
    id?: string;
    role?: string;
    name?: string;
    care_unit_id?: string;
  }>;
  healthcare_services?: Array<{
    id?: string;
    name?: string;
    duration?: number;
    care_unit_id?: string;
  }>;
}

export interface PollResult {
  facilityId: string;
  careUnitId: string;
  emr: string;
  appointmentsFetched: number;
  created: number;
  updated: number;
  cancelled: number;
  skippedEchoGuard: number;
  skippedUnchanged: number;
  errors: string[];
}

@Injectable()
export class LeyrPollingService {
  private readonly logger = new Logger(LeyrPollingService.name);
  private readonly windowDaysBack: number;
  private readonly windowDaysForward: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leyrService: LeyrService,
    private readonly config: ConfigService,
  ) {
    this.windowDaysBack = this.config.get<number>(
      'LEYR_POLL_WINDOW_DAYS_BACK',
      7,
    );
    this.windowDaysForward = this.config.get<number>(
      'LEYR_POLL_WINDOW_DAYS_FORWARD',
      30,
    );
  }

  @Cron('0 */15 * * * *')
  async handleScheduledPoll() {
    await this.pollAllClinics('scheduled-poll');
  }

  async pollAllClinics(trigger: string): Promise<{
    trigger: string;
    results: PollResult[];
    completedAt: string;
  }> {
    const facilities = await this.prisma.facilityMapping.findMany({
      where: { pollingEnabled: true },
    });

    if (facilities.length === 0) {
      this.logger.log('No facilities with polling enabled — skipping');
      return {
        trigger,
        results: [],
        completedAt: new Date().toISOString(),
      };
    }

    this.logger.log(
      `[${trigger}] Polling ${facilities.length} clinic(s) for Leyr changes`,
    );

    const results: PollResult[] = [];

    for (const facility of facilities) {
      try {
        const result = await this.pollClinic(facility);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Polling failed for facility ${facility.id} (${facility.leyrCareUnitId}): ${msg}`,
        );
        results.push({
          facilityId: facility.id,
          careUnitId: facility.leyrCareUnitId,
          emr: facility.leyrEmr,
          appointmentsFetched: 0,
          created: 0,
          updated: 0,
          cancelled: 0,
          skippedEchoGuard: 0,
          skippedUnchanged: 0,
          errors: [msg],
        });
      }
    }

    return {
      trigger,
      results,
      completedAt: new Date().toISOString(),
    };
  }

  async pollSingleClinic(careUnitId: string): Promise<PollResult> {
    const facility = await this.prisma.facilityMapping.findFirst({
      where: { leyrCareUnitId: careUnitId, pollingEnabled: true },
    });

    if (!facility) {
      throw new Error(
        `No polling-enabled FacilityMapping for careUnitId=${careUnitId}`,
      );
    }

    return this.pollClinic(facility);
  }

  private async pollClinic(
    facility: {
      id: string;
      leyrCareUnitId: string;
      leyrEmr: string;
      lastPolledAt: Date | null;
    },
  ): Promise<PollResult> {
    const now = new Date();
    const result: PollResult = {
      facilityId: facility.id,
      careUnitId: facility.leyrCareUnitId,
      emr: facility.leyrEmr,
      appointmentsFetched: 0,
      created: 0,
      updated: 0,
      cancelled: 0,
      skippedEchoGuard: 0,
      skippedUnchanged: 0,
      errors: [],
    };

    const windowStart = facility.lastPolledAt
      ? new Date(facility.lastPolledAt.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - this.windowDaysBack * 24 * 60 * 60 * 1000);

    const windowEnd = new Date(
      now.getTime() + this.windowDaysForward * 24 * 60 * 60 * 1000,
    );

    const rawResponse = await this.leyrService.getAppointments(
      facility.leyrCareUnitId,
      undefined,
      windowStart.toISOString(),
      windowEnd.toISOString(),
      facility.leyrEmr,
    );

    const appointments = (
      Array.isArray(rawResponse) ? rawResponse : []
    ) as LeyrApiAppointment[];

    result.appointmentsFetched = appointments.length;

    this.logger.log(
      `Polled ${facility.leyrCareUnitId}: ${appointments.length} appointments in window`,
    );

    for (const appt of appointments) {
      try {
        await this.processPolledAppointment(appt, facility, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${appt.id}: ${msg}`);
        this.logger.warn(`Error processing polled appointment ${appt.id}: ${msg}`);
      }
    }

    await this.prisma.facilityMapping.update({
      where: { id: facility.id },
      data: { lastPolledAt: now },
    });

    this.logger.log(
      `Poll complete for ${facility.leyrCareUnitId}: ` +
      `${result.created} new, ${result.updated} updated, ${result.cancelled} cancelled, ` +
      `${result.skippedEchoGuard} echo-guarded, ${result.skippedUnchanged} unchanged`,
    );

    return result;
  }

  private async processPolledAppointment(
    appt: LeyrApiAppointment,
    facility: { id: string; leyrCareUnitId: string; leyrEmr: string },
    result: PollResult,
  ): Promise<void> {
    const leyrAppointmentId = String(appt.id ?? appt.emr_id ?? '');
    if (!leyrAppointmentId) return;

    const patientParticipant = appt.participants?.find(
      (p) => p.role === 'patient',
    );
    const practitionerParticipant = appt.participants?.find(
      (p) => p.role === 'practitioner',
    );

    const patientId = patientParticipant?.id ?? '';
    const resourceId = practitionerParticipant?.id ?? '';
    const healthcareServiceId = appt.healthcare_services?.[0]?.id ?? '';
    const parsedStart = appt.start ? new Date(appt.start) : null;
    const parsedEnd = appt.end ? new Date(appt.end) : null;
    const status = appt.status ?? null;

    // Echo guard: skip if we recently pushed this to Leyr
    const link = await this.prisma.appointmentLink.findFirst({
      where: { leyrAppointmentId },
    });

    if (
      link?.echoGuardUntil &&
      link.echoGuardUntil > new Date() &&
      link.lastSyncDirection === 'GHL_TO_LEYR'
    ) {
      result.skippedEchoGuard++;
      return;
    }

    const existing = await this.prisma.leyrAppointment.findUnique({
      where: { leyrAppointmentId },
    });

    if (!existing) {
      // NEW appointment — upsert + enqueue create
      await this.upsertLeyrAppointment(
        leyrAppointmentId,
        appt,
        facility,
        patientId,
        resourceId,
        healthcareServiceId,
        parsedStart,
        parsedEnd,
      );
      await this.enqueueSync(
        leyrAppointmentId,
        'LEYR:AppointmentCreate',
        facility,
      );
      result.created++;
      return;
    }

    // Check for cancellation
    if (
      status === 'cancelled' &&
      existing.status !== 'cancelled'
    ) {
      await this.prisma.leyrAppointment.update({
        where: { id: existing.id },
        data: {
          status: 'cancelled',
          rawPayload: appt as unknown as Prisma.InputJsonValue,
        },
      });
      await this.enqueueSync(
        leyrAppointmentId,
        'LEYR:AppointmentCancel',
        facility,
      );
      result.cancelled++;
      return;
    }

    // Check for changes (reschedule, resource change, etc.)
    if (this.hasChanged(existing, appt, parsedStart, parsedEnd, resourceId, healthcareServiceId, status)) {
      await this.upsertLeyrAppointment(
        leyrAppointmentId,
        appt,
        facility,
        patientId,
        resourceId,
        healthcareServiceId,
        parsedStart,
        parsedEnd,
      );
      await this.enqueueSync(
        leyrAppointmentId,
        'LEYR:AppointmentUpdate',
        facility,
      );
      result.updated++;
      return;
    }

    result.skippedUnchanged++;
  }

  private hasChanged(
    local: {
      startAt: Date;
      endAt: Date;
      status: string | null;
      resourceId: string;
      healthcareServiceId: string;
    },
    remote: LeyrApiAppointment,
    parsedStart: Date | null,
    parsedEnd: Date | null,
    remoteResourceId: string,
    remoteServiceId: string,
    remoteStatus: string | null,
  ): boolean {
    if (
      parsedStart &&
      Math.abs(local.startAt.getTime() - parsedStart.getTime()) > 60_000
    ) {
      return true;
    }
    if (
      parsedEnd &&
      Math.abs(local.endAt.getTime() - parsedEnd.getTime()) > 60_000
    ) {
      return true;
    }
    if (remoteStatus && local.status !== remoteStatus) return true;
    if (remoteResourceId && local.resourceId !== remoteResourceId) return true;
    if (remoteServiceId && local.healthcareServiceId !== remoteServiceId) {
      return true;
    }
    return false;
  }

  private async upsertLeyrAppointment(
    leyrAppointmentId: string,
    appt: LeyrApiAppointment,
    facility: { leyrCareUnitId: string; leyrEmr: string },
    patientId: string,
    resourceId: string,
    healthcareServiceId: string,
    parsedStart: Date | null,
    parsedEnd: Date | null,
  ): Promise<void> {
    const data = {
      emr: facility.leyrEmr,
      emrId: appt.emr_id ? String(appt.emr_id) : null,
      careUnitId: String(appt.care_unit_id ?? facility.leyrCareUnitId),
      patientId,
      resourceId,
      healthcareServiceId,
      startAt:
        parsedStart && !Number.isNaN(parsedStart.getTime())
          ? parsedStart
          : new Date(),
      endAt:
        parsedEnd && !Number.isNaN(parsedEnd.getTime())
          ? parsedEnd
          : new Date(),
      status: appt.status ?? null,
      description: appt.description ?? null,
      comment: appt.comment ?? null,
      participants: appt.participants
        ? (appt.participants as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      healthcareServices: appt.healthcare_services
        ? (appt.healthcare_services as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      rawPayload: appt as unknown as Prisma.InputJsonValue,
    };

    await this.prisma.leyrAppointment.upsert({
      where: { leyrAppointmentId },
      create: { leyrAppointmentId, ...data },
      update: data,
    });
  }

  private async enqueueSync(
    leyrAppointmentId: string,
    sourceSystem: string,
    facility: { leyrEmr: string },
  ): Promise<void> {
    const action = sourceSystem.split(':')[1] ?? sourceSystem;
    const changeHash = createHash('md5')
      .update(`${leyrAppointmentId}:${action}:${Date.now()}`)
      .digest('hex')
      .slice(0, 8);

    const idempotencyKey = `LEYR_POLL:${leyrAppointmentId}:${action}:${changeHash}`;

    const leyrDb = await this.prisma.leyrAppointment.findUnique({
      where: { leyrAppointmentId },
      select: { id: true },
    });

    if (!leyrDb) {
      this.logger.warn(
        `Cannot enqueue sync: LeyrAppointment ${leyrAppointmentId} not found in DB`,
      );
      return;
    }

    // Check if there's already a pending/failed sync for this appointment + action
    const existingPending = await this.prisma.appointmentSync.findFirst({
      where: {
        sourceExternalId: leyrAppointmentId,
        sourceSystem,
        status: { in: ['pending', 'failed'] },
      },
    });

    if (existingPending) {
      this.logger.log(
        `Skipping enqueue — pending sync already exists for ${leyrAppointmentId} (${sourceSystem})`,
      );
      return;
    }

    await this.prisma.appointmentSync.create({
      data: {
        idempotencyKey,
        direction: 'LEYR_TO_GHL',
        status: 'pending',
        sourceSystem,
        sourceExternalId: leyrAppointmentId,
        targetSystem: 'GHL',
        leyrAppointmentId: leyrDb.id,
      },
    });

    this.logger.log(
      `Enqueued ${sourceSystem} for Leyr appointment ${leyrAppointmentId}`,
    );
  }
}
