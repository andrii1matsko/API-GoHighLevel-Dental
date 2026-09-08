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
 * Horizon: always the full configured window (~31 days). Leyr is queried
 * day-by-day only because wide ranges 504 or silently omit slots; results are
 * merged before writing one complete dedicated schedule per staff.
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
        // Chunk Leyr queries — a single 31-day timeslots call often 504s.
        const slots = await this.fetchFreeWindowsChunked({
          careUnitId: opts.careUnitId,
          resourceId: member.leyrResourceId,
          healthcareServiceId: opts.leyrHealthcareServiceId,
          startMs: now,
          endMs,
          emr: opts.emr,
        });
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
        const message = this.errorMessage(err);
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

  private errorMessage(err: unknown): string {
    if (!err || typeof err !== 'object') return String(err);
    const anyErr = err as { message?: unknown; response?: { message?: unknown } };
    const raw = anyErr.message ?? anyErr.response?.message;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'message' in raw) {
      const nested = (raw as { message?: unknown }).message;
      if (typeof nested === 'string') return nested;
    }
    try {
      return JSON.stringify(raw ?? err);
    } catch {
      return String(err);
    }
  }

  private isTransientTimeout(err: unknown): boolean {
    return /timed?\s*out|timeout|GATEWAY_TIMEOUT|504/i.test(
      this.errorMessage(err),
    );
  }

  /**
   * Leyr often 504s or silently returns an incomplete timeslot list on wide
   * ranges (e.g. drops 13:50 while keeping 13:00 on the same day). Fetch one
   * clinic-local day at a time with retries.
   */
  private async fetchFreeWindowsChunked(opts: {
    careUnitId: string;
    resourceId: string;
    healthcareServiceId: string;
    startMs: number;
    endMs: number;
    emr: string;
  }): Promise<FreeSlotWindow[]> {
    const merged: FreeSlotWindow[] = [];
    const seen = new Set<string>();
    // Day keys in clinic TZ covering [startMs, endMs).
    const dayKeys = listHorizonDates(
      opts.startMs,
      Math.max(
        1,
        Math.ceil((opts.endMs - opts.startMs) / (24 * 60 * 60 * 1000)) + 1,
      ),
      this.timezone,
    );

    for (const day of dayKeys) {
      const dayStart = this.clinicDayStartUtcMs(day);
      if (dayStart >= opts.endMs) continue;
      if (dayStart + 24 * 60 * 60 * 1000 <= opts.startMs) continue;

      const rangeStart = Math.max(opts.startMs, dayStart);
      const rangeEnd = Math.min(opts.endMs, dayStart + 24 * 60 * 60 * 1000);
      if (rangeEnd <= rangeStart) continue;

      const raw = await this.getTimeslotsWithRetry(
        opts.careUnitId,
        opts.resourceId,
        opts.healthcareServiceId,
        new Date(rangeStart).toISOString(),
        new Date(rangeEnd).toISOString(),
        opts.emr,
      );
      for (const slot of this.toFreeWindows(raw)) {
        const key = `${slot.start}|${slot.end ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(slot);
      }
      // Small pause — Leyr rate-limits / times out under bursty day scans.
      await new Promise((r) => setTimeout(r, 80));
    }
    return merged;
  }

  /** Midnight in clinic timezone for YYYY-MM-DD, as UTC epoch ms. */
  private clinicDayStartUtcMs(day: string): number {
    // Europe/Stockholm is UTC+1 / UTC+2 — resolve via Intl offset at noon UTC.
    const noonUtc = new Date(`${day}T12:00:00.000Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(noonUtc);
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(tzName);
    const offsetHours = m ? Number(m[1]) : 2;
    const offsetMins = m?.[2] ? Number(m[2]) : 0;
    const offsetMs =
      (offsetHours * 60 + Math.sign(offsetHours) * offsetMins) * 60_000;
    return Date.parse(`${day}T00:00:00.000Z`) - offsetMs;
  }

  private async getTimeslotsWithRetry(
    careUnitId: string,
    resourceId: string,
    healthcareServiceId: string,
    start: string,
    end: string,
    emr: string,
  ): Promise<unknown> {
    const attempts = 3;
    let lastError: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await this.leyrService.getTimeslots(
          careUnitId,
          resourceId,
          healthcareServiceId,
          start,
          end,
          emr,
        );
      } catch (err) {
        lastError = err;
        if (i < attempts && this.isTransientTimeout(err)) {
          const waitMs = 1000 * i;
          this.logger.warn(
            `Leyr timeslots timed out ${start}→${end} (attempt ${i}/${attempts}), retry in ${waitMs}ms`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
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

  /**
   * Read-only dump of GHL schedules + sample date rules for one staff /
   * calendar. Used to diagnose missing widget slots (e.g. afternoon 13:00).
   */
  async inspectStaffAvailability(opts: {
    locationId: string;
    userId: string;
    calendarId: string;
    sampleDates?: string[];
  }): Promise<Record<string, unknown>> {
    const searched = await this.ghl.searchSchedules({
      locationId: opts.locationId,
      userId: opts.userId,
    });
    const sample =
      opts.sampleDates?.length ?
        opts.sampleDates
      : listHorizonDates(Date.now(), 3, this.timezone).slice(0, 3);

    const schedules = searched.schedules.map((s) => {
      const rules = this.parseExistingRules(s.rules);
      const dateRules = rules.filter(
        (r): r is Extract<ScheduleRule, { type: 'date' }> => r.type === 'date',
      );
      const sampleRules = dateRules.filter((r) => sample.includes(r.date));
      return {
        id: s.id,
        name: s.name,
        calendarIds: s.calendarIds,
        dedicated: this.isDedicatedSchedule(s, opts.calendarId),
        timezone: s.timezone,
        wdayCount: rules.filter((r) => r.type === 'wday').length,
        dateRuleCount: dateRules.length,
        sampleDateRules: sampleRules,
      };
    });

    return {
      locationId: opts.locationId,
      userId: opts.userId,
      calendarId: opts.calendarId,
      sampleDates: sample,
      scheduleCount: schedules.length,
      schedules,
    };
  }

  private scheduleAppliesToCalendar(
    schedule: Record<string, unknown>,
    calendarId: string,
  ): boolean {
    const ids = Array.isArray(schedule.calendarIds)
      ? schedule.calendarIds.map(String)
      : [];
    // Empty calendarIds = applies broadly (typical Work Hours).
    if (ids.length === 0) return true;
    return ids.includes(calendarId);
  }

  /**
   * GHL intersects availability across a user's schedules for a calendar.
   * Old stomps left morning-only date rules on Work Hours, which then hid
   * afternoon Muntra slots (e.g. 13:00) even when the dedicated schedule had
   * them. Strip horizon date rules from non-dedicated schedules.
   */
  private async clearHorizonDateRulesFromOtherSchedules(opts: {
    locationId: string;
    userId: string;
    calendarId: string;
    schedules: Record<string, unknown>[];
    horizonDates: string[];
  }): Promise<void> {
    const horizon = new Set(opts.horizonDates);
    for (const schedule of opts.schedules) {
      if (!schedule?.id) continue;
      if (this.isDedicatedSchedule(schedule, opts.calendarId)) continue;
      if (!this.scheduleAppliesToCalendar(schedule, opts.calendarId)) continue;

      const rules = this.parseExistingRules(schedule.rules);
      const next = rules.filter(
        (r) => !(r.type === 'date' && horizon.has(r.date)),
      );
      const removed = rules.length - next.length;
      if (removed === 0) continue;

      await this.ghl.updateSchedule(String(schedule.id), {
        locationId: opts.locationId,
        rules: next,
      });
      this.logger.warn(
        `Cleared ${removed} horizon date-rule(s) from non-dedicated schedule ${schedule.id} (${String(schedule.name ?? '')}) user=${opts.userId} so they cannot hide Muntra windows`,
      );
    }
  }

  private async upsertDedicatedStaffSchedule(opts: {
    locationId: string;
    userId: string;
    calendarId: string;
    dateRules: ReturnType<typeof buildDateSpecificRules>['rules'];
    horizonDates: string[];
    staffLabel: string;
  }): Promise<void> {
    // Load ALL user schedules (no calendarId filter) so we can find Work Hours
    // leftovers that still apply to this calendar and intersect free-slots.
    const searched = await this.ghl.searchSchedules({
      locationId: opts.locationId,
      userId: opts.userId,
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
    } else {
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

    await this.clearHorizonDateRulesFromOtherSchedules({
      locationId: opts.locationId,
      userId: opts.userId,
      calendarId: opts.calendarId,
      schedules: searched.schedules,
      horizonDates: opts.horizonDates,
    });
  }
}
