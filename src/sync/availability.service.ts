import { Injectable, Logger, HttpException } from '@nestjs/common';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';
import { PrismaService } from '../prisma/prisma.service';

export type GhlFreeSlotsResponse = Record<string, { slots: string[] } | string>;

interface LeyrTimeslot {
  start?: string;
  end?: string;
  available?: boolean;
  healthcare_service_id?: string;
  resource_id?: string;
}

/**
 * Free slots for GHL service calendars that actually match Leyr/Muntra/Opus
 * availability. Native GHL free-slots on service_booking calendars ignore
 * staff busy blocks — use this for booking UIs / custom widgets.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly leyrService: LeyrService,
    private readonly serviceMappingResolver: ServiceMappingResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async getLeyrBackedFreeSlots(opts: {
    ghlCalendarId: string;
    startDateMs: number;
    endDateMs: number;
    timezone?: string;
    ghlUserId?: string;
  }): Promise<GhlFreeSlotsResponse> {
    if (
      !Number.isFinite(opts.startDateMs) ||
      !Number.isFinite(opts.endDateMs)
    ) {
      throw new HttpException(
        'startDate and endDate are required numbers',
        400,
      );
    }
    if (opts.endDateMs < opts.startDateMs) {
      throw new HttpException('endDate must be greater than startDate', 400);
    }
    const maxRange = 31 * 24 * 60 * 60 * 1000;
    if (opts.endDateMs - opts.startDateMs > maxRange) {
      throw new HttpException('Date range cannot be more than 31 days', 400);
    }

    const mapping = await this.prisma.calendarServiceMapping.findUnique({
      where: { ghlCalendarId: opts.ghlCalendarId },
      include: { facility: true },
    });

    if (!mapping) {
      throw new HttpException(
        `No CalendarServiceMapping for GHL calendar ${opts.ghlCalendarId}`,
        404,
      );
    }

    const leyrTarget = await this.serviceMappingResolver.resolveLeyrTarget(
      opts.ghlCalendarId,
      opts.ghlUserId,
    );

    // When a specific GHL staff is selected, only that Leyr resource.
    // When none, omit resource filter so we see any free clinician for the service.
    let resourceId: string | undefined;
    if (opts.ghlUserId) {
      const staff = await this.prisma.staffResourceMapping.findUnique({
        where: {
          ghlUserId_facilityMappingId: {
            ghlUserId: opts.ghlUserId,
            facilityMappingId: mapping.facilityMappingId,
          },
        },
      });
      resourceId = staff?.leyrResourceId;
      if (!resourceId) {
        this.logger.warn(
          `No staff mapping for GHL user ${opts.ghlUserId} — returning no slots`,
        );
        return {};
      }
    }

    const startIso = new Date(opts.startDateMs).toISOString();
    const endIso = new Date(opts.endDateMs).toISOString();

    const raw = await this.leyrService.getTimeslots(
      leyrTarget.careUnitId,
      resourceId,
      leyrTarget.healthcareServiceId,
      startIso,
      endIso,
      leyrTarget.emr,
    );

    const slots = Array.isArray(raw) ? (raw as LeyrTimeslot[]) : [];
    const byDay: Record<string, string[]> = {};

    for (const slot of slots) {
      if (!slot?.start || slot.available === false) continue;
      const start = String(slot.start);
      const dayKey = this.dayKey(start, opts.timezone);
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(start);
    }

    for (const day of Object.keys(byDay)) {
      byDay[day].sort();
    }

    const result: GhlFreeSlotsResponse = {};
    for (const [day, daySlots] of Object.entries(byDay)) {
      result[day] = { slots: daySlots };
    }

    this.logger.log(
      `Leyr free-slots calendar=${opts.ghlCalendarId} service=${leyrTarget.healthcareServiceId} ` +
        `emr=${leyrTarget.emr} days=${Object.keys(result).length} ` +
        `slots=${slots.length}`,
    );

    return result;
  }

  private dayKey(isoStart: string, timezone?: string): string {
    const d = new Date(isoStart);
    if (Number.isNaN(d.getTime())) {
      return isoStart.slice(0, 10);
    }
    if (!timezone) {
      // Prefer offset in the string itself (Leyr returns +02:00 etc.)
      const m = isoStart.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      return d.toISOString().slice(0, 10);
    }
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return isoStart.slice(0, 10);
    }
  }
}
