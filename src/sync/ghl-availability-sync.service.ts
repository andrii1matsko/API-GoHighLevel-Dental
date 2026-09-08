import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import {
  buildDateSpecificRules,
  defaultWeekdayRules,
  listHorizonDates,
  mergeScheduleRules,
  ScheduleRule,
  FreeSlotWindow,
} from './availability-windows.util';

interface LeyrTimeslot {
  start?: string;
  end?: string;
  available?: boolean;
}

export interface AvailabilitySyncResult {
  enabled: boolean;
  horizonDays: number;
  timezone: string;
  skipped?: string;
  calendars: Array<{
    ghlCalendarId: string;
    locationId: string;
    staffUpdated: number;
    slotsCovered: number;
    errors: string[];
  }>;
  completedAt: string;
}

export interface AvailabilitySyncFilter {
  ghlLocationId?: string;
  ghlCalendarId?: string;
}

/**
 * Pushes Leyr/Muntra free timeslots into GHL staff Date-specific hours so the
 * native booking widget only offers real free times (no Google Conflict).
 *
 * Safety: refuses to update a schedule if any free slot would be dropped.
 * Isolation: one dedicated schedule per (userId, calendarId) — never reuse /
 * overwrite a shared Work Hours schedule.
 */
@Injectable()
export class GhlAvailabilitySyncService {
  private readonly logger = new Logger(GhlAvailabilitySyncService.name);
  private readonly enabled: boolean;
  private readonly horizonDays: number;
  private readonly timezone: string;
  private readonly defaultDurationMinutes: number;
  private readonly allowedLocationIds: Set<string> | null;
  private readonly allowedCalendarIds: Set<string> | null;
  private readonly scheduleNamePrefix = 'Leyr/Muntra avail';
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leyrService: LeyrService,
    private readonly ghl: GohighlevelService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      this.config.get<string>('SYNC_GHL_AVAILABILITY_SYNC_ENABLED', 'false') ===
      'true';
    const configured = Number(
      this.config.get<string | number>(
        'SYNC_GHL_AVAILABILITY_HORIZON_DAYS',
        this.config.get<string | number>('LEYR_POLL_WINDOW_DAYS_FORWARD', 31),
      ),
    );
    this.horizonDays = Math.min(
      31,
      Math.max(1, Number.isFinite(configured) ? configured : 31),
    );
    this.timezone =
      this.config.get<string>(
        'SYNC_GHL_AVAILABILITY_TIMEZONE',
        'Europe/Stockholm',
      ) ?? 'Europe/Stockholm';
    this.defaultDurationMinutes = Number(
      this.config.get<string | number>(
        'SYNC_GHL_AVAILABILITY_SLOT_DURATION_MINUTES',
        30,
      ),
    );
    this.allowedLocationIds = this.parseIdSet(
      this.config.get<string>('SYNC_GHL_AVAILABILITY_LOCATION_IDS'),
    );
    this.allowedCalendarIds = this.parseIdSet(
      this.config.get<string>('SYNC_GHL_AVAILABILITY_CALENDAR_IDS'),
    );
  }

  private parseIdSet(raw?: string | null): Set<string> | null {
    if (!raw?.trim()) return null;
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }

  @Cron('30 */15 * * * *')
  async handleScheduledSync() {
    if (!this.enabled) return;
    await this.syncAll('scheduled');
  }

  async syncAll(
    trigger = 'manual',
    filter: AvailabilitySyncFilter = {},
  ): Promise<AvailabilitySyncResult> {
    if (!this.enabled) {
      return {
        enabled: false,
        horizonDays: this.horizonDays,
        timezone: this.timezone,
        calendars: [],
        completedAt: new Date().toISOString(),
      };
    }
    if (this.running) {
      this.logger.warn(
        `Availability sync skipped (already running) [${trigger}]`,
      );
      return {
        enabled: true,
        horizonDays: this.horizonDays,
        timezone: this.timezone,
        skipped: 'already-running',
        calendars: [],
        completedAt: new Date().toISOString(),
      };
    }

    this.running = true;
    const started = Date.now();
    try {
      const mappings = await this.prisma.calendarServiceMapping.findMany({
        include: {
          facility: { include: { staffMappings: true } },
        },
      });

      const filtered = mappings.filter((m) => {
        if (
          filter.ghlCalendarId &&
          m.ghlCalendarId !== filter.ghlCalendarId.trim()
        ) {
          return false;
        }
        if (
          filter.ghlLocationId &&
          m.facility.ghlLocationId !== filter.ghlLocationId.trim()
        ) {
          return false;
        }
        if (
          this.allowedCalendarIds &&
          !this.allowedCalendarIds.has(m.ghlCalendarId)
        ) {
          return false;
        }
        if (
          this.allowedLocationIds &&
          !this.allowedLocationIds.has(m.facility.ghlLocationId)
        ) {
          return false;
        }
        return true;
      });

      const calendars: AvailabilitySyncResult['calendars'] = [];
      for (const mapping of filtered) {
        calendars.push(
          await this.syncCalendar({
            ghlCalendarId: mapping.ghlCalendarId,
            leyrHealthcareServiceId: mapping.leyrHealthcareServiceId,
            locationId: mapping.facility.ghlLocationId,
            careUnitId: mapping.facility.leyrCareUnitId,
            emr: mapping.facility.leyrEmr,
            staff: mapping.facility.staffMappings.map((s) => ({
              ghlUserId: s.ghlUserId,
              leyrResourceId: s.leyrResourceId,
              name: s.ghlUserName,
            })),
          }),
        );
      }

      this.logger.log(
        `Availability sync done [${trigger}] calendars=${calendars.length} ` +
          `in ${Date.now() - started}ms horizon=${this.horizonDays}d`,
      );

      return {
        enabled: true,
        horizonDays: this.horizonDays,
        timezone: this.timezone,
        calendars,
        completedAt: new Date().toISOString(),
      };
    } finally {
      this.running = false;
    }
  }

  async syncCalendar(opts: {
    ghlCalendarId: string;
    leyrHealthcareServiceId: string;
    locationId: string;
    careUnitId: string;
    emr: string;
    staff: Array<{
      ghlUserId: string;
      leyrResourceId: string;
      name?: string | null;
    }>;
  }): Promise<AvailabilitySyncResult['calendars'][number]> {
    const errors: string[] = [];
    let staffUpdated = 0;
    let slotsCovered = 0;

    if (opts.staff.length === 0) {
      errors.push('No StaffResourceMapping for facility — skipped');
      return {
        ghlCalendarId: opts.ghlCalendarId,
        locationId: opts.locationId,
        staffUpdated: 0,
        slotsCovered: 0,
        errors,
      };
    }

    const now = Date.now();
    const endMs = now + this.horizonDays * 24 * 60 * 60 * 1000;
    const horizonDates = listHorizonDates(now, this.horizonDays, this.timezone);

    for (const member of opts.staff) {
      try {
        const raw = await this.leyrService.getTimeslots(
          opts.careUnitId,
          member.leyrResourceId,
          opts.leyrHealthcareServiceId,
          new Date(now).toISOString(),
          new Date(endMs).toISOString(),
          opts.emr,
        );
        const slots = this.toFreeWindows(raw);
        const { rules: dateRules, coveredSlotCount } = buildDateSpecificRules({
          slots,
          horizonDates,
          timezone: this.timezone,
          defaultDurationMinutes: this.defaultDurationMinutes,
        });
        slotsCovered += coveredSlotCount;

        await this.upsertDedicatedStaffSchedule({
          locationId: opts.locationId,
          userId: member.ghlUserId,
          calendarId: opts.ghlCalendarId,
          dateRules,
          horizonDates,
          staffLabel: member.name ?? member.ghlUserId,
        });
        staffUpdated += 1;
        // Brief pause — GHL schedule API is slow / rate-sensitive.
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${member.ghlUserId}: ${message}`);
        this.logger.error(
          `Availability sync failed calendar=${opts.ghlCalendarId} user=${member.ghlUserId}: ${message}`,
        );
      }
    }

    return {
      ghlCalendarId: opts.ghlCalendarId,
      locationId: opts.locationId,
      staffUpdated,
      slotsCovered,
      errors,
    };
  }

  private toFreeWindows(raw: unknown): FreeSlotWindow[] {
    const list = Array.isArray(raw) ? (raw as LeyrTimeslot[]) : [];
    const out: FreeSlotWindow[] = [];
    for (const slot of list) {
      if (!slot?.start || slot.available === false) continue;
      out.push({
        start: String(slot.start),
        end: slot.end ? String(slot.end) : undefined,
      });
    }
    return out;
  }

  private parseExistingRules(raw: unknown): ScheduleRule[] {
    if (!Array.isArray(raw)) return [];
    const wdays = new Set([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
    const out: ScheduleRule[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const intervals = Array.isArray(r.intervals)
        ? (r.intervals as { from: string; to: string }[]).filter(
            (iv) =>
              iv && typeof iv.from === 'string' && typeof iv.to === 'string',
          )
        : [];
      if (r.type === 'wday' && typeof r.day === 'string' && wdays.has(r.day)) {
        out.push({
          type: 'wday',
          day: r.day as
            | 'monday'
            | 'tuesday'
            | 'wednesday'
            | 'thursday'
            | 'friday'
            | 'saturday'
            | 'sunday',
          intervals,
        });
      } else if (r.type === 'date' && typeof r.date === 'string') {
        out.push({ type: 'date', date: r.date, intervals });
      }
    }
    return out;
  }

  private dedicatedScheduleName(calendarId: string, staffLabel: string): string {
    return `${this.scheduleNamePrefix} · ${calendarId} · ${staffLabel}`.slice(
      0,
      120,
    );
  }

  private isDedicatedSchedule(
    schedule: Record<string, unknown>,
    calendarId: string,
  ): boolean {
    const ids = Array.isArray(schedule.calendarIds)
      ? schedule.calendarIds.map(String)
      : [];
    if (ids.length === 1 && ids[0] === calendarId) return true;
    const name = typeof schedule.name === 'string' ? schedule.name : '';
    return (
      name.startsWith(this.scheduleNamePrefix) && name.includes(calendarId)
    );
  }

  private async upsertDedicatedStaffSchedule(opts: {
    locationId: string;
    userId: string;
    calendarId: string;
    dateRules: ReturnType<typeof buildDateSpecificRules>['rules'];
    horizonDates: string[];
    staffLabel: string;
  }): Promise<void> {
    const searched = await this.ghl.searchSchedules({
      locationId: opts.locationId,
      userId: opts.userId,
      calendarId: opts.calendarId,
    });

    // Never fall back to schedules[0] — that stomps shared Work Hours.
    const existing = searched.schedules.find((s) =>
      this.isDedicatedSchedule(s, opts.calendarId),
    );

    const existingRules = this.parseExistingRules(existing?.rules);
    const hasWday = existingRules.some((r) => r.type === 'wday');
    const baseRules = hasWday ? existingRules : defaultWeekdayRules();
    const merged = mergeScheduleRules({
      existing: baseRules,
      dateRulesForHorizon: opts.dateRules,
      horizonDates: opts.horizonDates,
    });

    const name = this.dedicatedScheduleName(opts.calendarId, opts.staffLabel);

    if (existing?.id) {
      await this.ghl.updateSchedule(String(existing.id), {
        locationId: opts.locationId,
        name,
        timezone: this.timezone,
        rules: merged,
      });
      this.logger.log(
        `Updated dedicated GHL schedule ${existing.id} user=${opts.userId} calendar=${opts.calendarId} dateRules=${opts.dateRules.length}`,
      );
      return;
    }

    await this.ghl.createSchedule({
      locationId: opts.locationId,
      userId: opts.userId,
      name,
      timezone: this.timezone,
      calendarIds: [opts.calendarId],
      rules: merged,
    });
    this.logger.log(
      `Created dedicated GHL schedule user=${opts.userId} calendar=${opts.calendarId} dateRules=${opts.dateRules.length}`,
    );
  }
}
