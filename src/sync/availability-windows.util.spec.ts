import {
  buildDateSpecificRules,
  intervalCoversSlot,
  mergeIntervals,
  mergeScheduleRules,
  defaultWeekdayRules,
} from './availability-windows.util';

describe('availability-windows.util', () => {
  const tz = 'Europe/Stockholm';

  it('merges overlapping intervals without shrinking coverage', () => {
    expect(
      mergeIntervals([
        { from: '09:00', to: '09:30' },
        { from: '09:20', to: '10:00' },
        { from: '13:00', to: '13:30' },
      ]),
    ).toEqual([
      { from: '09:00', to: '10:00' },
      { from: '13:00', to: '13:30' },
    ]);
  });

  it('intervalCoversSlot requires full slot inside window', () => {
    expect(
      intervalCoversSlot(
        { from: '09:00', to: '09:30' },
        '09:00',
        '09:30',
      ),
    ).toBe(true);
    expect(
      intervalCoversSlot(
        { from: '09:00', to: '09:15' },
        '09:00',
        '09:30',
      ),
    ).toBe(false);
  });

  it('builds date rules covering every Muntra free slot', () => {
    const { rules, coveredSlotCount } = buildDateSpecificRules({
      timezone: tz,
      horizonDates: ['2026-09-17', '2026-09-18'],
      slots: [
        {
          start: '2026-09-17T09:00:00+02:00',
          end: '2026-09-17T09:30:00+02:00',
        },
        {
          start: '2026-09-17T13:00:00+02:00',
          end: '2026-09-17T13:30:00+02:00',
        },
        {
          start: '2026-09-18T09:50:00+02:00',
          end: '2026-09-18T10:20:00+02:00',
        },
      ],
    });

    expect(coveredSlotCount).toBe(3);
    const d17 = rules.find((r) => r.date === '2026-09-17');
    const d18 = rules.find((r) => r.date === '2026-09-18');
    expect(d17?.intervals).toEqual([
      { from: '09:00', to: '09:30' },
      { from: '13:00', to: '13:30' },
    ]);
    expect(d18?.intervals).toEqual([{ from: '09:50', to: '10:20' }]);
  });

  it('does not widen intervals beyond service duration (avoids extra 15-min starts)', () => {
    const { rules } = buildDateSpecificRules({
      timezone: tz,
      horizonDates: ['2026-09-18'],
      defaultDurationMinutes: 30,
      slots: [
        {
          start: '2026-09-18T09:00:00+02:00',
          // Leyr sometimes returns a long end — must not open 09:00–11:00
          end: '2026-09-18T11:00:00+02:00',
        },
      ],
    });
    expect(rules.find((r) => r.date === '2026-09-18')?.intervals).toEqual([
      { from: '09:00', to: '09:30' },
    ]);
  });

  it('closes days with zero free slots so weekly hours cannot reopen them', () => {
    const { rules } = buildDateSpecificRules({
      timezone: tz,
      horizonDates: ['2026-09-09', '2026-09-17'],
      slots: [
        {
          start: '2026-09-17T09:00:00+02:00',
          end: '2026-09-17T09:30:00+02:00',
        },
      ],
    });
    expect(rules.find((r) => r.date === '2026-09-09')?.intervals).toEqual([]);
    expect(rules.find((r) => r.date === '2026-09-17')?.intervals).toEqual([
      { from: '09:00', to: '09:30' },
    ]);
  });

  it('mergeScheduleRules keeps wday and replaces all date rules with horizon set', () => {
    const merged = mergeScheduleRules({
      existing: [
        ...defaultWeekdayRules(),
        {
          type: 'date',
          date: '2026-09-01',
          intervals: [{ from: '10:00', to: '11:00' }],
        },
        {
          type: 'date',
          date: '2026-09-17',
          intervals: [{ from: '08:00', to: '08:30' }],
        },
      ],
      horizonDates: ['2026-09-17'],
      dateRulesForHorizon: [
        {
          type: 'date',
          date: '2026-09-17',
          intervals: [{ from: '09:00', to: '09:30' }],
        },
      ],
    });

    expect(merged.filter((r) => r.type === 'wday')).toHaveLength(5);
    expect(merged.filter((r) => r.type === 'date')).toHaveLength(1);
    expect(
      merged.find((r) => r.type === 'date' && r.date === '2026-09-01'),
    ).toBeUndefined();
    expect(
      merged.find((r) => r.type === 'date' && r.date === '2026-09-17'),
    ).toEqual({
      type: 'date',
      date: '2026-09-17',
      intervals: [{ from: '09:00', to: '09:30' }],
    });
  });
});
