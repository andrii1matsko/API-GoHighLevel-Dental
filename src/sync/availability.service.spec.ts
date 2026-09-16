import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  const mapping = {
    id: 'csm-1',
    ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T',
    facilityMappingId: 'fac-muntra',
    leyrHealthcareServiceId: '359',
    facility: {
      id: 'fac-muntra',
      leyrCareUnitId: 'L925_6509',
      leyrEmr: 'muntra',
    },
  };

  function build(overrides?: {
    timeslots?: unknown;
    staff?: { leyrResourceId: string } | null;
  }) {
    const leyr = {
      getTimeslots: jest.fn().mockResolvedValue(
        overrides?.timeslots ?? [
          {
            start: '2026-09-11T09:40:00+02:00',
            end: '2026-09-11T10:30:00+02:00',
            healthcare_service_id: '359',
            resource_id: '2287',
          },
        ],
      ),
    };
    const resolver = {
      resolveLeyrTarget: jest.fn().mockResolvedValue({
        careUnitId: 'L925_6509',
        emr: 'muntra',
        healthcareServiceId: '359',
        resourceId: '2287',
      }),
    };
    const prisma = {
      calendarServiceMapping: {
        findUnique: jest.fn().mockResolvedValue(mapping),
      },
      staffResourceMapping: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides?.staff === undefined
              ? { leyrResourceId: '2287' }
              : overrides.staff,
          ),
      },
    };

    const svc = new AvailabilityService(
      leyr as never,
      resolver as never,
      prisma as never,
    );
    return { svc, leyr, resolver, prisma };
  }

  it('groups Leyr timeslots into GHL free-slots shape', async () => {
    const { svc, leyr } = build();
    const start = Date.parse('2026-09-11T00:00:00+02:00');
    const end = Date.parse('2026-09-12T00:00:00+02:00');

    const result = await svc.getLeyrBackedFreeSlots({
      ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T',
      startDateMs: start,
      endDateMs: end,
      timezone: 'Europe/Stockholm',
    });

    expect(result['2026-09-11']).toEqual({
      slots: ['2026-09-11T09:40:00+02:00'],
    });
    expect(leyr.getTimeslots).toHaveBeenCalledWith(
      'L925_6509',
      undefined,
      '359',
      expect.any(String),
      expect.any(String),
      'muntra',
    );
  });

  it('filters by staff resource when ghlUserId provided', async () => {
    const { svc, leyr } = build();
    const start = Date.parse('2026-09-11T00:00:00+02:00');
    const end = Date.parse('2026-09-12T00:00:00+02:00');

    await svc.getLeyrBackedFreeSlots({
      ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T',
      startDateMs: start,
      endDateMs: end,
      ghlUserId: '4VkUtem3g9U6HTlhHoX9',
    });

    expect(leyr.getTimeslots).toHaveBeenCalledWith(
      'L925_6509',
      '2287',
      '359',
      expect.any(String),
      expect.any(String),
      'muntra',
    );
  });

  it('returns empty when staff has no mapping', async () => {
    const { svc } = build({ staff: null });
    const result = await svc.getLeyrBackedFreeSlots({
      ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T',
      startDateMs: Date.parse('2026-09-11T00:00:00+02:00'),
      endDateMs: Date.parse('2026-09-12T00:00:00+02:00'),
      ghlUserId: 'unknown-user',
    });
    expect(result).toEqual({});
  });
});
