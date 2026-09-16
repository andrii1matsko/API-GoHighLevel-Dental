/**
 * Pure helpers: Muntra/Leyr free slots → GHL date-specific schedule intervals.
 *
 * Critical invariant: every free slot must remain bookable after conversion.
 * We only ever ADD open windows from Leyr; we never shrink a window below
 * the slot's [start, end]. Days in the horizon with zero free slots get an
 * explicit empty-interval date rule so weekly hours do not reopen the day.
 */

export interface FreeSlotWindow {
  /** ISO start (with offset preferred) */
  start: string;
  /** ISO end; if missing, start + defaultDurationMinutes */
  end?: string;
}

export interface TimeIntervalHm {
  from: string; // HH:mm 24h
  to: string; // HH:mm 24h
}

export interface DateScheduleRule {
  type: 'date';
  date: string; // YYYY-MM-DD in clinic timezone
  intervals: TimeIntervalHm[];
}

export interface WdayScheduleRule {
  type: 'wday';
  day:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';
  intervals: TimeIntervalHm[];
}

export type ScheduleRule = DateScheduleRule | WdayScheduleRule;

const DEFAULT_DURATION_MINUTES = 30;

export function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHm(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(total)));
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function dayKeyInTimezone(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : iso.slice(0, 10);
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

export function hmInTimezone(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '00:00';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** Inclusive coverage: slot [start,end] fully inside interval [from,to]. */
export function intervalCoversSlot(
  interval: TimeIntervalHm,
  slotFrom: string,
  slotTo: string,
): boolean {
  const a = hmToMinutes(interval.from);
  const b = hmToMinutes(interval.to);
  const s = hmToMinutes(slotFrom);
  const e = hmToMinutes(slotTo);
  if ([a, b, s, e].some((n) => Number.isNaN(n))) return false;
  if (b <= a) return false;
  return s >= a && e <= b;
}

export function mergeIntervals(intervals: TimeIntervalHm[]): TimeIntervalHm[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort(
    (x, y) => hmToMinutes(x.from) - hmToMinutes(y.from),
  );
  const out: TimeIntervalHm[] = [];
  for (const cur of sorted) {
    const fromM = hmToMinutes(cur.from);
    const toM = hmToMinutes(cur.to);
    if (Number.isNaN(fromM) || Number.isNaN(toM) || toM <= fromM) continue;
    const last = out[out.length - 1];
    if (!last) {
      out.push({ from: minutesToHm(fromM), to: minutesToHm(toM) });
      continue;
    }
    const lastTo = hmToMinutes(last.to);
    // Merge overlaps only. Touching ends (10:30–11:15 + 11:15–12:00) must stay
    // separate — otherwise GHL opens every slotInterval start inside the blob
    // (10:45, 11:00, …) that Leyr never offered.
    if (fromM < lastTo) {
      last.to = minutesToHm(Math.max(lastTo, toM));
    } else {
      out.push({ from: minutesToHm(fromM), to: minutesToHm(toM) });
    }
  }
  return out;
}

export function slotToInterval(
  slot: FreeSlotWindow,
  timezone: string,
  defaultDurationMinutes = DEFAULT_DURATION_MINUTES,
): {
  date: string;
  interval: TimeIntervalHm;
  slotFrom: string;
  slotTo: string;
} | null {
  const start = new Date(slot.start);
  if (Number.isNaN(start.getTime())) return null;

  // Tight window: exactly one bookable start for service duration.
  // Using Leyr's longer end would open extra 15-min starts inside GHL widget.
  const durationMs = Math.max(1, defaultDurationMinutes) * 60_000;
  let end = new Date(start.getTime() + durationMs);
  if (slot.end) {
    const leyrEnd = new Date(slot.end);
    if (!Number.isNaN(leyrEnd.getTime()) && leyrEnd > start) {
      // Never widen past duration; may shorten if Leyr end is tighter.
      end = new Date(Math.min(leyrEnd.getTime(), start.getTime() + durationMs));
    }
  }

  const date = dayKeyInTimezone(slot.start, timezone);
  const slotFrom = hmInTimezone(slot.start, timezone);
  const fromM = hmToMinutes(slotFrom);
  if (Number.isNaN(fromM)) return null;

  const endDay = dayKeyInTimezone(end.toISOString(), timezone);
  let toHm =
    endDay === date
      ? hmInTimezone(end.toISOString(), timezone)
      : minutesToHm(fromM + defaultDurationMinutes);
  let toM = hmToMinutes(toHm);
  if (Number.isNaN(toM) || toM <= fromM) {
    toHm = minutesToHm(fromM + defaultDurationMinutes);
    toM = fromM + defaultDurationMinutes;
  }

  return {
    date,
    interval: { from: slotFrom, to: toHm },
    slotFrom,
    slotTo: toHm,
  };
}

export function listHorizonDates(
  startMs: number,
  horizonDays: number,
  timezone: string,
): string[] {
  const days: string[] = [];
  // Walk noon UTC + i days and format in clinic TZ to avoid DST edge holes.
  const base = new Date(startMs);
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    days.push(dayKeyInTimezone(d.toISOString(), timezone));
  }
  // Unique preserve order
  return [...new Set(days)];
}

/** Next calendar day YYYY-MM-DD (UTC date arithmetic on the civil day key). */
export function nextDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + 1));
  return utc.toISOString().slice(0, 10);
}

/**
 * Convert a clinic-local civil date+time to UTC epoch ms (handles DST).
 * Iteratively corrects the UTC guess using Intl formatting in `timezone`.
 */
export function zonedLocalTimeToUtcMs(
  day: string,
  hour: number,
  minute: number,
  timezone: string,
): number {
  const [y, mo, d] = day.split('-').map(Number);
  let utcMs = Date.UTC(y, mo - 1, d, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utcMs));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    const asLocal = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    const desired = Date.UTC(y, mo - 1, d, hour, minute, 0);
    const delta = desired - asLocal;
    if (delta === 0) break;
    utcMs += delta;
  }
  return utcMs;
}

/** [start, end) UTC bounds for a clinic-local calendar day (DST-safe). */
export function clinicDayBoundsUtcMs(
  day: string,
  timezone: string,
): { startMs: number; endMs: number } {
  const startMs = zonedLocalTimeToUtcMs(day, 0, 0, timezone);
  const endMs = zonedLocalTimeToUtcMs(nextDayKey(day), 0, 0, timezone);
  return { startMs, endMs };
}

/**
 * Build date-specific rules for the full horizon.
 * - Every Leyr free slot becomes an open interval (overlap-merged per day;
 *   touching ends stay separate so GHL cannot invent mid-window starts).
 * - Every horizon day with no free slots gets intervals: [] (closes weekly hours).
 * Throws if any free slot would not be covered after merge (must not push).
 */
export function buildDateSpecificRules(opts: {
  slots: FreeSlotWindow[];
  horizonDates: string[];
  timezone: string;
  defaultDurationMinutes?: number;
}): { rules: DateScheduleRule[]; coveredSlotCount: number } {
  const duration = opts.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  const byDay = new Map<string, TimeIntervalHm[]>();
  const required: Array<{ date: string; from: string; to: string }> = [];

  for (const slot of opts.slots) {
    const converted = slotToInterval(slot, opts.timezone, duration);
    if (!converted) continue;
    if (!opts.horizonDates.includes(converted.date)) continue;
    const list = byDay.get(converted.date) ?? [];
    list.push(converted.interval);
    byDay.set(converted.date, list);
    required.push({
      date: converted.date,
      from: converted.slotFrom,
      to: converted.slotTo,
    });
  }

  const rules: DateScheduleRule[] = [];
  for (const date of opts.horizonDates) {
    const merged = mergeIntervals(byDay.get(date) ?? []);
    rules.push({ type: 'date', date, intervals: merged });
  }

  // Guarantee: no free slot lost
  const uncovered: string[] = [];
  for (const req of required) {
    const dayRule = rules.find((r) => r.date === req.date);
    const ok = (dayRule?.intervals ?? []).some((iv) =>
      intervalCoversSlot(iv, req.from, req.to),
    );
    if (!ok) {
      uncovered.push(`${req.date} ${req.from}-${req.to}`);
    }
  }
  if (uncovered.length > 0) {
    throw new Error(
      `Availability conversion would drop free slots: ${uncovered.slice(0, 10).join(', ')}`,
    );
  }

  return { rules, coveredSlotCount: required.length };
}

export function mergeScheduleRules(opts: {
  existing: ScheduleRule[];
  dateRulesForHorizon: DateScheduleRule[];
  horizonDates: string[];
}): ScheduleRule[] {
  // Keep weekly hours only. Drop ALL prior date-specific rules so the payload
  // stays bounded (~horizonDays). Keeping out-of-horizon dates caused GHL
  // schedule updates to grow without limit and time out.
  void opts.horizonDates;
  const kept = opts.existing.filter((r) => r.type === 'wday');
  return [...kept, ...opts.dateRulesForHorizon];
}

export function defaultWeekdayRules(
  from = '08:00',
  to = '17:00',
): WdayScheduleRule[] {
  const days: WdayScheduleRule['day'][] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
  ];
  return days.map((day) => ({
    type: 'wday',
    day,
    intervals: [{ from, to }],
  }));
}

/**
 * Closed weekly base for dedicated Muntra schedules: only date-specific rules
 * may open bookable time. Prevents wday 08–17 from reopening days outside the
 * synced horizon (or after horizon ends mid-day).
 */
export function closedWeekdayRules(): WdayScheduleRule[] {
  const days: WdayScheduleRule['day'][] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return days.map((day) => ({
    type: 'wday',
    day,
    intervals: [],
  }));
}
