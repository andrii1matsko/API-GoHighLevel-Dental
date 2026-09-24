import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncService } from './calendar-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { IdentityResolverService } from './identity-resolver.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';

function makePrismaStub() {
  return {
    appointmentSync: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    appointmentLink: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    leyrAppointment: { findUnique: jest.fn() },
    ghlAppointment: { findUnique: jest.fn() },
    $transaction: jest.fn(async (ops: unknown) => ops),
  } as unknown as PrismaService;
}

function makeGhlStub() {
  return {
    createAppointment: jest.fn(),
    updateAppointment: jest.fn(),
    deleteEvent: jest.fn(),
    createBlockSlot: jest.fn(),
    updateBlockSlot: jest.fn(),
  } as unknown as GohighlevelService;
}

function makeLeyrStub() {
  return {
    createAppointment: jest.fn(),
    updateAppointment: jest.fn(),
    getTimeslots: jest.fn().mockResolvedValue([]),
  } as unknown as LeyrService;
}

function makeConfigStub(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    LEYR_EMR: 'opus',
    SYNC_LEYR_DEFAULT_CARE_UNIT_ID: 'cu-stockholm-01',
    SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID: 'hs-001',
    SYNC_LEYR_DEFAULT_RESOURCE_ID: 'res-001',
    SYNC_GHL_DEFAULT_CONTACT_ID: 'contact-001',
    SYNC_GHL_DEFAULT_LOCATION_ID: 'loc-001',
    SYNC_GHL_DEFAULT_CALENDAR_ID: 'cal-001',
    SYNC_PRECHECK_TIMESLOTS: 'false',
    SYNC_CANCEL_GHL_ON_LEYR_REJECT: 'false',
    SYNC_LEYR_TO_GHL_BLOCK_SLOTS_ONLY: 'false',
    GHL_LOCATION_ID_OAUTH: '',
    GHL_LOCATION_ID: '',
    GHL_CALENDAR_ID: '',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: string | number) => {
      if (key in defaults) return defaults[key];
      if (key === 'SYNC_MAX_RETRIES') return 5;
      if (key === 'SYNC_ECHO_GUARD_SECONDS') return 60;
      return fallback ?? '';
    }),
  } as unknown as ConfigService;
}

function makeIdentityStub() {
  return {
    resolveLeyrPatient: jest.fn().mockResolvedValue({
      leyrPatientId: 'pat-001',
      created: false,
    }),
    resolveGhlContact: jest.fn().mockResolvedValue({
      ghlContactId: 'contact-001',
      created: false,
    }),
  } as unknown as IdentityResolverService;
}

function makeServiceMappingStub() {
  return {
    resolveLeyrTarget: jest.fn().mockResolvedValue({
      careUnitId: 'cu-stockholm-01',
      emr: 'opus',
      healthcareServiceId: 'hs-001',
      resourceId: 'res-001',
    }),
    resolveGhlTarget: jest.fn().mockResolvedValue({
      locationId: 'loc-001',
      calendarId: 'cal-001',
      groupId: 'group-001',
      assignedUserId: 'user-001',
    }),
    listFacilityCalendarIds: jest.fn().mockResolvedValue(['cal-001']),
  } as unknown as ServiceMappingResolverService;
}

function makeService(
  prisma = makePrismaStub(),
  ghl = makeGhlStub(),
  leyr = makeLeyrStub(),
  config = makeConfigStub(),
  identity = makeIdentityStub(),
  serviceMapping = makeServiceMappingStub(),
) {
  const availabilitySync = {
    syncAll: jest.fn().mockResolvedValue({
      enabled: true,
      calendars: [],
      completedAt: new Date().toISOString(),
    }),
  };
  return {
    service: new CalendarSyncService(
      prisma,
      ghl,
      leyr,
      config,
      identity,
      serviceMapping,
      availabilitySync as never,
    ),
    prisma,
    ghl,
    leyr,
    identity,
    serviceMapping,
    availabilitySync,
  };
}

describe('CalendarSyncService - Edge Cases', () => {
  describe('Sweden/Norway timezone handling', () => {
    it('correctly syncs appointment with Sweden timezone (Europe/Stockholm, CET/CEST)', async () => {
      const { service, prisma, ghl } = makeService();

      const swedenSummerTime = new Date('2026-06-15T09:00:00+02:00');
      const swedenSummerEnd = new Date('2026-06-15T10:00:00+02:00');

      const syncRow = {
        id: 'sync-se-1',
        direction: 'LEYR_TO_GHL',
        status: 'pending',
        sourceSystem: 'LEYR',
        sourceExternalId: 'leyr-se-001',
        targetSystem: 'GHL',
        targetExternalId: null,
        retryCount: 0,
        leyrAppointment: {
          id: 'leyr-db-se-1',
          leyrAppointmentId: 'leyr-se-001',
          startAt: swedenSummerTime,
          endAt: swedenSummerEnd,
          description: 'Undersökning',
          comment: null,
        },
        ghlAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({
        id: 'ghl-se-new',
      });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'ghl-db-se',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('tz-test');
      expect(result.syncedCount).toBe(1);

      const callArgs = (ghl.createAppointment as jest.Mock).mock.calls[0] as [
        { startTime: string; endTime: string },
        unknown,
      ];
      const payload = callArgs[0];

      const startParsed = new Date(payload.startTime);
      expect(startParsed.toISOString()).toBe(swedenSummerTime.toISOString());
    });

    it('correctly syncs appointment with Norway timezone (Europe/Oslo, CET/CEST)', async () => {
      const { service, prisma, ghl } = makeService();

      const norwaySummerTime = new Date('2026-06-15T08:30:00+02:00');
      const norwaySummerEnd = new Date('2026-06-15T09:30:00+02:00');

      const syncRow = {
        id: 'sync-no-1',
        direction: 'LEYR_TO_GHL',
        status: 'pending',
        sourceSystem: 'LEYR',
        sourceExternalId: 'leyr-no-001',
        targetSystem: 'GHL',
        targetExternalId: null,
        retryCount: 0,
        leyrAppointment: {
          id: 'leyr-db-no-1',
          leyrAppointmentId: 'leyr-no-001',
          startAt: norwaySummerTime,
          endAt: norwaySummerEnd,
          description: 'Tannrens',
          comment: null,
        },
        ghlAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({
        id: 'ghl-no-new',
      });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'ghl-db-no',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('tz-test-no');
      expect(result.syncedCount).toBe(1);

      const callArgs = (ghl.createAppointment as jest.Mock).mock.calls[0] as [
        { startTime: string; endTime: string },
        unknown,
      ];
      const payload = callArgs[0];
      const startParsed = new Date(payload.startTime);
      expect(startParsed.toISOString()).toBe(norwaySummerTime.toISOString());
    });

    it('handles Sweden winter time (CET, UTC+1)', async () => {
      const { service, prisma, leyr } = makeService();

      const swedenWinterStart = new Date('2026-12-15T09:00:00+01:00');
      const swedenWinterEnd = new Date('2026-12-15T10:00:00+01:00');

      const syncRow = {
        id: 'sync-se-winter',
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentCreate',
        sourceExternalId: 'ghl-winter-001',
        targetSystem: 'LEYR',
        targetExternalId: null,
        retryCount: 0,
        ghlAppointment: {
          id: 'ghl-db-winter',
          ghlAppointmentId: 'ghl-winter-001',
          locationId: 'loc-1',
          calendarId: 'cal-1',
          contactId: 'contact-se-1',
          startAt: swedenWinterStart,
          endAt: swedenWinterEnd,
          title: 'Winter Checkup',
        },
        leyrAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-winter' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'leyr-db-winter',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('winter-test');
      expect(result.syncedCount).toBe(1);

      const callArgs = (leyr.createAppointment as jest.Mock).mock.calls[0] as [
        string,
        { start: string; end: string },
        string,
        unknown,
      ];
      const payload = callArgs[1];
      const startParsed = new Date(payload.start);
      expect(startParsed.getUTCHours()).toBe(8);
    });

    it('handles Norway winter time (CET, UTC+1)', async () => {
      const { service, prisma, leyr } = makeService();

      const norwayWinterStart = new Date('2026-01-20T10:00:00+01:00');
      const norwayWinterEnd = new Date('2026-01-20T11:00:00+01:00');

      const syncRow = {
        id: 'sync-no-winter',
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentCreate',
        sourceExternalId: 'ghl-no-winter-001',
        targetSystem: 'LEYR',
        retryCount: 0,
        ghlAppointment: {
          id: 'ghl-db-no-winter',
          ghlAppointmentId: 'ghl-no-winter-001',
          locationId: 'loc-1',
          calendarId: 'cal-1',
          contactId: 'contact-no-1',
          startAt: norwayWinterStart,
          endAt: norwayWinterEnd,
          title: 'Winter Dental',
        },
        leyrAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-no-winter' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-id',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('no-winter-test');
      expect(result.syncedCount).toBe(1);

      const callArgs = (leyr.createAppointment as jest.Mock).mock.calls[0] as [
        string,
        { start: string; end: string },
        string,
        unknown,
      ];
      const startParsed = new Date(callArgs[1].start);
      expect(startParsed.getUTCHours()).toBe(9);
    });

    it('preserves ISO offset across Sweden DST boundary', async () => {
      const { service, prisma, ghl } = makeService();

      const lastSundayMarchStart = new Date('2026-03-29T01:30:00+01:00');
      const lastSundayMarchEnd = new Date('2026-03-29T02:30:00+01:00');

      const syncRow = {
        id: 'sync-dst',
        direction: 'LEYR_TO_GHL',
        status: 'pending',
        sourceSystem: 'LEYR',
        sourceExternalId: 'leyr-dst-001',
        targetSystem: 'GHL',
        retryCount: 0,
        leyrAppointment: {
          id: 'leyr-db-dst',
          startAt: lastSundayMarchStart,
          endAt: lastSundayMarchEnd,
          description: 'DST boundary appointment',
          comment: null,
        },
        ghlAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({ id: 'ghl-dst' });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-dst',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('dst-test');
      expect(result.syncedCount).toBe(1);

      const callArgs = (ghl.createAppointment as jest.Mock).mock.calls[0] as [
        { startTime: string },
        unknown,
      ];
      const parsedStart = new Date(callArgs[0].startTime);
      expect(parsedStart.getTime()).toBe(lastSundayMarchStart.getTime());
    });
  });

  describe('duplicate webhook handling', () => {
    it('processes same appointment id twice without error', async () => {
      const { service, prisma, leyr } = makeService();

      const row1 = {
        id: 'sync-dup-1',
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentCreate',
        sourceExternalId: 'ghl-dup-001',
        targetSystem: 'LEYR',
        retryCount: 0,
        ghlAppointment: {
          id: 'ghl-db-dup',
          ghlAppointmentId: 'ghl-dup-001',
          locationId: 'loc-1',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startAt: new Date('2026-06-15T09:00:00+02:00'),
          endAt: new Date('2026-06-15T10:00:00+02:00'),
          title: 'Duplicate Test',
        },
        leyrAppointment: null,
      };

      const row2 = {
        ...row1,
        id: 'sync-dup-2',
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        row1,
        row2,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === 'sync-dup-1') return Promise.resolve(row1);
          return Promise.resolve(row2);
        },
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-dup' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-leyr',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('dup-test');

      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('expired/missing data edge cases', () => {
    it('handles GHL appointment with null startAt by marking row failed in DB', async () => {
      const { service, prisma } = makeService();

      const ghlAppt = {
        id: 'ghl-db-null',
        ghlAppointmentId: 'ghl-null-001',
        locationId: 'loc-1',
        calendarId: 'cal-1',
        contactId: 'c-1',
        startAt: null,
        endAt: null,
        title: 'No times',
      };

      const syncRow = {
        id: 'sync-null-time',
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentCreate',
        sourceExternalId: 'ghl-null-001',
        targetSystem: 'LEYR',
        retryCount: 0,
        ghlAppointment: ghlAppt,
        leyrAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('null-time-test');

      // markRowFailed returns without throwing, so syncAppointments counts it as "synced"
      expect(result.syncedCount).toBe(1);
      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'GHL appointment missing start/end time',
          }),
        }),
      );
    });

    it('handles Leyr appointment with no description or comment', async () => {
      const { service, prisma, ghl } = makeService();

      const syncRow = {
        id: 'sync-no-desc',
        direction: 'LEYR_TO_GHL',
        status: 'pending',
        sourceSystem: 'LEYR',
        sourceExternalId: 'leyr-no-desc',
        targetSystem: 'GHL',
        retryCount: 0,
        leyrAppointment: {
          id: 'leyr-db-no-desc',
          startAt: new Date('2026-06-15T09:00:00+02:00'),
          endAt: new Date('2026-06-15T10:00:00+02:00'),
          description: null,
          comment: null,
        },
        ghlAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({ id: 'ghl-new' });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-id',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('no-desc-test');

      expect(result.syncedCount).toBe(1);
      const callArgs = (ghl.createAppointment as jest.Mock).mock.calls[0] as [
        { title: string },
        unknown,
      ];
      expect(callArgs[0].title).toMatch(/Synced from Leyr/);
    });
  });

  describe('concurrent/batch edge cases', () => {
    it('handles empty batch gracefully', async () => {
      const { service, prisma } = makeService();
      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncAppointments('empty-batch');

      expect(result.pendingFound).toBe(0);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('marks all rows failed in DB when all have unsupported mutation type', async () => {
      const { service, prisma } = makeService();

      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `fail-${i}`,
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentUpdate',
        sourceExternalId: `ghl-fail-${i}`,
        targetSystem: 'LEYR',
        retryCount: 0,
        ghlAppointment: {
          id: `ghl-db-fail-${i}`,
          ghlAppointmentId: `ghl-fail-${i}`,
          locationId: 'loc-1',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startAt: new Date('2026-06-15T09:00:00+02:00'),
          endAt: new Date('2026-06-15T10:00:00+02:00'),
          title: 'Will fail',
        },
        leyrAppointment: null,
      }));

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.appointmentSync.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('all-fail');

      expect(result.pendingFound).toBe(3);
      // markRowFailed returns without throwing, so all are counted as "synced" from the loop perspective
      expect(result.syncedCount).toBe(3);
      // But all 3 rows are marked as 'failed' in the DB
      expect(prisma.appointmentSync.update).toHaveBeenCalledTimes(3);
      const updateCalls = (prisma.appointmentSync.update as jest.Mock).mock
        .calls as Array<[{ data: { status: string } }]>;
      for (const call of updateCalls) {
        expect(call[0].data.status).toBe('failed');
      }
    });

    it('handles external service throwing non-Error objects', async () => {
      const { service, prisma, leyr } = makeService();

      const syncRow = {
        id: 'sync-non-error',
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: 'GHL:AppointmentCreate',
        sourceExternalId: 'ghl-ne-001',
        targetSystem: 'LEYR',
        retryCount: 0,
        ghlAppointment: {
          id: 'ghl-db-ne',
          ghlAppointmentId: 'ghl-ne-001',
          locationId: 'loc-1',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startAt: new Date('2026-06-15T09:00:00+02:00'),
          endAt: new Date('2026-06-15T10:00:00+02:00'),
          title: 'Test',
        },
        leyrAppointment: null,
      };

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockRejectedValue('string error');
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('non-error-test');

      expect(result.failedCount).toBe(1);
    });
  });
});
