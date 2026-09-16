import { ConfigService } from '@nestjs/config';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';

describe('ServiceMappingResolverService.resolveGhlTarget', () => {
  const muntraFacility = {
    id: 'fac-muntra',
    leyrCareUnitId: 'L925_6509',
    leyrEmr: 'muntra',
    ghlLocationId: 'YqUlz1ErFupeWjrXiiDJ',
    ghlGroupId: 'grp-kallered',
  };

  const kalleredCalendar = {
    id: 'csm-1',
    ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T',
    leyrHealthcareServiceId: '180',
    facilityMappingId: muntraFacility.id,
  };

  const majorstuaDefaultCalendar = '1Wji81CmUx0VmDAYSeAD';

  function build(prisma: Record<string, unknown>) {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const map: Record<string, string> = {
          LEYR_EMR: 'opus',
          SYNC_GHL_DEFAULT_CALENDAR_ID: majorstuaDefaultCalendar,
          SYNC_GHL_DEFAULT_LOCATION_ID: '3hVPjaJpMLtF29L0zaBX',
        };
        return map[key] ?? fallback ?? '';
      }),
    } as unknown as ConfigService;

    return new ServiceMappingResolverService(prisma as never, config);
  }

  it('uses exact CalendarServiceMapping when present', async () => {
    const prisma = {
      facilityMapping: {
        findUnique: jest.fn().mockResolvedValue(muntraFacility),
      },
      calendarServiceMapping: {
        findUnique: jest.fn().mockResolvedValue(kalleredCalendar),
        findFirst: jest.fn(),
      },
      staffResourceMapping: {
        findUnique: jest.fn().mockResolvedValue({
          ghlUserId: 'Lh4Vf8mBJ6hoLYlYFmxn',
        }),
      },
    };

    const svc = build(prisma);
    const target = await svc.resolveGhlTarget(
      'L925_6509',
      'muntra',
      '180',
      '13771',
    );

    expect(target).toEqual({
      calendarId: 'M4fGB5ZSScHmQCMg7y1T',
      groupId: 'grp-kallered',
      locationId: 'YqUlz1ErFupeWjrXiiDJ',
      assignedUserId: 'Lh4Vf8mBJ6hoLYlYFmxn',
    });
    expect(prisma.calendarServiceMapping.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to another calendar in the SAME facility, never env Majorstua', async () => {
    const prisma = {
      facilityMapping: {
        findUnique: jest.fn().mockResolvedValue(muntraFacility),
      },
      calendarServiceMapping: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(kalleredCalendar),
      },
      staffResourceMapping: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const svc = build(prisma);
    const target = await svc.resolveGhlTarget(
      'L925_6509',
      'muntra',
      '99999',
      '13771',
    );

    expect(target.calendarId).toBe('M4fGB5ZSScHmQCMg7y1T');
    expect(target.locationId).toBe('YqUlz1ErFupeWjrXiiDJ');
    expect(target.calendarId).not.toBe(majorstuaDefaultCalendar);
    expect(prisma.calendarServiceMapping.findFirst).toHaveBeenCalledWith({
      where: { facilityMappingId: muntraFacility.id },
      orderBy: { id: 'asc' },
    });
  });

  it('returns staff-only (empty calendarId) when facility has no calendars', async () => {
    const prisma = {
      facilityMapping: {
        findUnique: jest.fn().mockResolvedValue(muntraFacility),
      },
      calendarServiceMapping: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffResourceMapping: {
        findUnique: jest.fn().mockResolvedValue({
          ghlUserId: 'Lh4Vf8mBJ6hoLYlYFmxn',
        }),
      },
    };

    const svc = build(prisma);
    const target = await svc.resolveGhlTarget(
      'L925_6509',
      'muntra',
      '99999',
      '13771',
    );

    expect(target).toEqual({
      calendarId: '',
      groupId: 'grp-kallered',
      locationId: 'YqUlz1ErFupeWjrXiiDJ',
      assignedUserId: 'Lh4Vf8mBJ6hoLYlYFmxn',
    });
    expect(target.calendarId).not.toBe(majorstuaDefaultCalendar);
  });

  it('lists all facility calendar ids for busy mirroring', async () => {
    const prisma = {
      facilityMapping: {
        findUnique: jest.fn().mockResolvedValue({
          ...muntraFacility,
          calendarMappings: [
            { ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T' },
            { ghlCalendarId: 'XWSktFqDODgHIecPBvuW' },
            { ghlCalendarId: 'M4fGB5ZSScHmQCMg7y1T' },
          ],
        }),
      },
    };

    const svc = build(prisma);
    await expect(
      svc.listFacilityCalendarIds('L925_6509', 'muntra'),
    ).resolves.toEqual(['M4fGB5ZSScHmQCMg7y1T', 'XWSktFqDODgHIecPBvuW']);
  });
});
