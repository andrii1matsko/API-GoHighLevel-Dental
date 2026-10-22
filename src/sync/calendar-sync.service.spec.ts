import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncService } from './calendar-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { IdentityResolverService } from './identity-resolver.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';
import { GhlAvailabilitySyncService } from './ghl-availability-sync.service';
import { formatLeyrDateTime } from './appointment-mapper';

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
    leyrAppointment: {
      findUnique: jest.fn(),
    },
    ghlAppointment: {
      findUnique: jest.fn(),
    },
    calendarServiceMapping: {
      findUnique: jest.fn().mockResolvedValue({
        facilityMappingId: 'facility-1',
      }),
    },
    staffResourceMapping: {
      findMany: jest.fn().mockResolvedValue([
        { leyrResourceId: 'res-001' },
        { leyrResourceId: 'res-002' },
      ]),
    },
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
    sendSmsToContact: jest.fn().mockResolvedValue({}),
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
    SYNC_NOTIFY_PATIENT_ON_SLOT_REJECT: 'true',
    SYNC_REJECT_PATIENT_SMS:
      'Sorry — your appointment was cancelled because that time was no longer available. Please book another slot.',
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

function makeAvailabilitySyncStub() {
  return {
    syncAll: jest.fn().mockResolvedValue({
      enabled: true,
      calendars: [],
      completedAt: new Date().toISOString(),
    }),
  } as unknown as GhlAvailabilitySyncService;
}

function makeService(
  prisma = makePrismaStub(),
  ghl = makeGhlStub(),
  leyr = makeLeyrStub(),
  config = makeConfigStub(),
  identity = makeIdentityStub(),
  serviceMapping = makeServiceMappingStub(),
  availabilitySync = makeAvailabilitySyncStub(),
) {
  return {
    service: new CalendarSyncService(
      prisma,
      ghl,
      leyr,
      config,
      identity,
      serviceMapping,
      availabilitySync,
    ),
    prisma,
    ghl,
    leyr,
    identity,
    serviceMapping,
    availabilitySync,
  };
}

function fakeGhlAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ghl-db-id-1',
    ghlAppointmentId: 'ghl-ext-001',
    locationId: 'loc-001',
    calendarId: 'cal-001',
    contactId: 'contact-001',
    startAt: new Date('2026-06-15T09:00:00+02:00'),
    endAt: new Date('2026-06-15T10:00:00+02:00'),
    title: 'Dental Checkup',
    status: 'confirmed',
    ...overrides,
  };
}

function fakeLeyrAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'leyr-db-id-1',
    leyrAppointmentId: 'leyr-ext-001',
    emr: 'opus',
    careUnitId: 'cu-stockholm-01',
    patientId: 'pat-001',
    resourceId: 'res-001',
    healthcareServiceId: 'hs-001',
    startAt: new Date('2026-06-15T09:00:00+02:00'),
    endAt: new Date('2026-06-15T10:00:00+02:00'),
    description: 'Examination',
    comment: null,
    ...overrides,
  };
}

function fakeSyncRow(
  direction: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'sync-row-1',
    direction,
    status: 'pending',
    sourceSystem:
      direction === 'GHL_TO_LEYR' ? 'GHL:AppointmentCreate' : 'LEYR',
    sourceExternalId:
      direction === 'GHL_TO_LEYR' ? 'ghl-ext-001' : 'leyr-ext-001',
    targetSystem: direction === 'GHL_TO_LEYR' ? 'LEYR' : 'GHL',
    targetExternalId: null,
    idempotencyKey: `${direction}:test`,
    errorMessage: null,
    retryCount: 0,
    syncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    leyrAppointmentId: null,
    ghlAppointmentId: null,
    ghlAppointment: direction === 'GHL_TO_LEYR' ? fakeGhlAppointment() : null,
    leyrAppointment: direction === 'LEYR_TO_GHL' ? fakeLeyrAppointment() : null,
    ...overrides,
  };
}

describe('CalendarSyncService', () => {
  describe('syncAppointments', () => {
    it('returns zero counts when no pending rows exist', async () => {
      const { service, prisma } = makeService();
      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncAppointments('test');

      expect(result.pendingFound).toBe(0);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.trigger).toBe('test');
    });

    it('processes GHL_TO_LEYR rows and increments syncedCount', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-new-001' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'leyr-db-new',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('processes LEYR_TO_GHL rows and increments syncedCount', async () => {
      const { service, prisma, ghl } = makeService();
      const syncRow = fakeSyncRow('LEYR_TO_GHL');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({
        id: 'ghl-new-001',
      });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'ghl-db-new',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('increments failedCount on unsupported direction', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('UNKNOWN_DIR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it('handles mixed success and actual-throw failure rows', async () => {
      const { service, prisma, leyr, ghl } = makeService();
      const goodRow = fakeSyncRow('LEYR_TO_GHL', { id: 'sync-1' });
      const throwRow = fakeSyncRow('LEYR_TO_GHL', { id: 'sync-2' });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        goodRow,
        throwRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === 'sync-1') return Promise.resolve(goodRow);
          return Promise.resolve(throwRow);
        },
      );
      (ghl.createAppointment as jest.Mock)
        .mockResolvedValueOnce({ id: 'ghl-new' })
        .mockRejectedValueOnce(new Error('GHL API timeout'));
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-id',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('idempotency', () => {
    it('marks row failed when GHL appointment payload is missing', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        ghlAppointment: null,
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue({
        ...syncRow,
        ghlAppointment: null,
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: syncRow.id },
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'Missing GHL appointment payload',
          }),
        }),
      );
    });

    it('marks row failed when Leyr appointment payload is missing', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('LEYR_TO_GHL', {
        leyrAppointment: null,
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue({
        ...syncRow,
        leyrAppointment: null,
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: syncRow.id },
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'Missing Leyr appointment payload',
          }),
        }),
      );
    });
  });

  describe('GHL_TO_LEYR processing', () => {
    it('reschedules via Leyr PATCH without status (only cancelled is supported)', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        sourceSystem: 'GHL:AppointmentUpdate',
        ghlAppointment: fakeGhlAppointment({
          status: 'confirmed',
          startAt: new Date('2026-09-09T15:00:00.000Z'),
          endAt: new Date('2026-09-09T15:45:00.000Z'),
        }),
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue({
        id: 'link-1',
        ghlAppointmentId: 'ghl-ext-001',
        leyrAppointmentId: 'leyr-ext-001',
        leyrEmr: 'opus',
        leyrCareUnitId: 'cu-stockholm-01',
        ghlBlockSlotId: null,
      });
      (leyr.updateAppointment as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(leyr.updateAppointment).toHaveBeenCalledWith(
        'leyr-ext-001',
        'cu-stockholm-01',
        expect.objectContaining({
          start: formatLeyrDateTime(
            new Date('2026-09-09T15:00:00.000Z'),
            'opus',
          ),
          end: formatLeyrDateTime(
            new Date('2026-09-09T15:45:00.000Z'),
            'opus',
          ),
          healthcare_service_id: 'hs-001',
          resource_id: 'res-001',
        }),
        'opus',
      );
      const patchBody = (leyr.updateAppointment as jest.Mock).mock.calls[0][2];
      expect(patchBody).not.toHaveProperty('status');
    });

    it('cancels via Leyr PATCH with status=cancelled only', async () => {
      const { service, prisma, leyr, ghl } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        sourceSystem: 'GHL:AppointmentDelete',
        ghlAppointment: fakeGhlAppointment({ locationId: 'loc-muntra' }),
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue({
        id: 'link-1',
        ghlAppointmentId: 'ghl-ext-001',
        leyrAppointmentId: 'leyr-ext-001',
        leyrEmr: 'muntra',
        leyrCareUnitId: 'L925_6509',
        ghlBlockSlotId: 'block-1',
      });
      (leyr.updateAppointment as jest.Mock).mockResolvedValue({});
      (ghl.deleteEvent as jest.Mock).mockResolvedValue({});
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue(null);

      await service.syncAppointments('test');

      expect(leyr.updateAppointment).toHaveBeenCalledWith(
        'leyr-ext-001',
        'L925_6509',
        { status: 'cancelled' },
        'muntra',
      );
      expect(ghl.deleteEvent).toHaveBeenCalledWith('block-1', {
        locationId: 'loc-muntra',
      });
    });

    it('fails when service mapping resolves empty Leyr targets', async () => {
      const serviceMapping = makeServiceMappingStub();
      (serviceMapping.resolveLeyrTarget as jest.Mock).mockResolvedValue({
        careUnitId: '',
        emr: 'opus',
        healthcareServiceId: '',
        resourceId: '',
      });
      const { service, prisma } = makeService(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceMapping,
      );
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('careUnitId'),
          }),
        }),
      );
    });

    it('fails when GHL appointment has no start/end time', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        ghlAppointment: fakeGhlAppointment({ startAt: null, endAt: null }),
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'GHL appointment missing start/end time',
          }),
        }),
      );
    });

    it('marks row failed when Leyr create returns no id', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([]);
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'Leyr create appointment returned no id',
          }),
        }),
      );
    });

    it('calls Leyr createAppointment with correct payload from GHL data', async () => {
      const { service, prisma, leyr } = makeService();
      const ghlAppt = fakeGhlAppointment();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', { ghlAppointment: ghlAppt });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-new' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-id',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(leyr.createAppointment).toHaveBeenCalledWith(
        'cu-stockholm-01',
        expect.objectContaining({
          start: formatLeyrDateTime(ghlAppt.startAt, 'opus'),
          end: formatLeyrDateTime(ghlAppt.endAt, 'opus'),
          healthcare_service_id: 'hs-001',
          resource_id: 'res-001',
          patient_id: 'pat-001',
        }),
        'opus',
        { enqueueSync: false },
      );
    });

    it('marks row success with correct targetExternalId', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-new-id' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'leyr-db-id',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'success',
            targetExternalId: 'leyr-new-id',
            leyrAppointmentId: 'leyr-db-id',
          }),
        }),
      );
    });
  });

  describe('LEYR_TO_GHL processing', () => {
    it('fails when service mapping resolves empty GHL calendar', async () => {
      const serviceMapping = makeServiceMappingStub();
      (serviceMapping.resolveGhlTarget as jest.Mock).mockResolvedValue({
        locationId: 'loc-001',
        calendarId: '',
        groupId: null,
        assignedUserId: null,
      });
      const { service, prisma } = makeService(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceMapping,
      );
      const syncRow = fakeSyncRow('LEYR_TO_GHL');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('calendarId'),
          }),
        }),
      );
    });

    it('calls GHL createAppointment with correct payload from Leyr data', async () => {
      const { service, prisma, ghl } = makeService();
      const leyrAppt = fakeLeyrAppointment();
      const syncRow = fakeSyncRow('LEYR_TO_GHL', { leyrAppointment: leyrAppt });

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

      await service.syncAppointments('test');

      expect(ghl.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: 'contact-001',
          locationId: 'loc-001',
          calendarId: 'cal-001',
          startTime: leyrAppt.startAt.toISOString(),
          endTime: leyrAppt.endAt.toISOString(),
          appointmentStatus: 'confirmed',
        }),
        { enqueueSync: false },
      );
    });

    it('marks row failed when GHL create returns no id', async () => {
      const { service, prisma, ghl } = makeService();
      const syncRow = fakeSyncRow('LEYR_TO_GHL');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (ghl.createAppointment as jest.Mock).mockResolvedValue({});
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'GHL create appointment returned no id',
          }),
        }),
      );
    });

    it('uses Leyr description as GHL title, falls back to comment', async () => {
      const { service, prisma, ghl } = makeService();
      const leyrAppt = fakeLeyrAppointment({
        description: null,
        comment: 'Tandvård',
      });
      const syncRow = fakeSyncRow('LEYR_TO_GHL', { leyrAppointment: leyrAppt });

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

      await service.syncAppointments('test');

      expect(ghl.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Tandvård' }),
        expect.anything(),
      );
    });

    it('uses fallback title when both description and comment are null', async () => {
      const { service, prisma, ghl } = makeService();
      const leyrAppt = fakeLeyrAppointment({
        description: null,
        comment: null,
      });
      const syncRow = fakeSyncRow('LEYR_TO_GHL', {
        leyrAppointment: leyrAppt,
        sourceExternalId: 'leyr-xyz',
      });

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

      await service.syncAppointments('test');

      expect(ghl.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Synced from EHR'),
        }),
        expect.anything(),
      );
    });
  });

  describe('error handling', () => {
    it('catches and counts errors thrown by external services', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (leyr.createAppointment as jest.Mock).mockRejectedValue(
        new Error('Leyr API timeout'),
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.failedCount).toBe(1);
      expect(result.syncedCount).toBe(0);
    });

    it('continues processing remaining rows after a thrown error', async () => {
      const { service, prisma, leyr, ghl } = makeService();
      const failRow = fakeSyncRow('GHL_TO_LEYR', { id: 'fail-row' });
      const successRow = fakeSyncRow('LEYR_TO_GHL', { id: 'success-row' });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        failRow,
        successRow,
      ]);

      (prisma.appointmentSync.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === 'fail-row')
            return Promise.reject(new Error('DB connection error'));
          return Promise.resolve(successRow);
        },
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});
      (ghl.createAppointment as jest.Mock).mockResolvedValue({ id: 'new-ghl' });
      (prisma.ghlAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db-id',
      });

      const result = await service.syncAppointments('test');

      expect(result.failedCount).toBe(1);
      expect(result.syncedCount).toBe(1);
    });

    it('markRowFailed increments retryCount', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        ghlAppointment: null,
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue({
        ...syncRow,
        ghlAppointment: null,
        retryCount: 0,
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retryCount: 1,
            status: 'failed',
          }),
        }),
      );
    });
  });

  describe('timeslot pre-check and loud fail', () => {
    it('rejects GHL create when Leyr timeslot is unavailable and cancels GHL appt', async () => {
      const { service, prisma, leyr, ghl, availabilitySync } = makeService(
        makePrismaStub(),
        makeGhlStub(),
        makeLeyrStub(),
        makeConfigStub({
          SYNC_PRECHECK_TIMESLOTS: 'true',
          SYNC_CANCEL_GHL_ON_LEYR_REJECT: 'true',
        }),
      );
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (leyr.getTimeslots as jest.Mock).mockResolvedValue([
        {
          start: '2026-06-15T12:00:00.000Z',
          end: '2026-06-15T12:30:00.000Z',
          available: true,
        },
      ]);
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});
      (ghl.updateAppointment as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.failedCount).toBe(1);
      expect(leyr.createAppointment).not.toHaveBeenCalled();
      expect(ghl.sendSmsToContact).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: 'loc-001',
          contactId: 'contact-001',
          message: expect.stringContaining('book'),
        }),
      );
      expect(ghl.updateAppointment).toHaveBeenCalledWith(
        'ghl-ext-001',
        expect.objectContaining({
          appointmentStatus: 'cancelled',
          locationId: 'loc-001',
          toNotify: true,
        }),
      );
      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'dead_letter',
            errorMessage: expect.stringContaining('NO_TIMESLOT'),
          }),
        }),
      );
      expect(availabilitySync.syncAll).toHaveBeenCalledWith(
        'after-leyr-reject',
        {
          ghlLocationId: 'loc-001',
          ghlCalendarId: 'cal-001',
        },
      );
    });

    it('allows create when Leyr timeslot matches requested start', async () => {
      const { service, prisma, leyr } = makeService(
        makePrismaStub(),
        makeGhlStub(),
        makeLeyrStub(),
        makeConfigStub({ SYNC_PRECHECK_TIMESLOTS: 'true' }),
      );
      const syncRow = fakeSyncRow('GHL_TO_LEYR');
      const startIso = syncRow.ghlAppointment.startAt.toISOString();

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (leyr.getTimeslots as jest.Mock).mockResolvedValue([
        {
          start: startIso,
          end: syncRow.ghlAppointment.endAt.toISOString(),
          available: true,
          resource_id: 'res-001',
        },
      ]);
      (leyr.createAppointment as jest.Mock).mockResolvedValue([
        { id: 'leyr-ok' },
      ]);
      (prisma.leyrAppointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'db',
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(leyr.createAppointment).toHaveBeenCalled();
    });

    it('fail-closed: refuses create when timeslot pre-check throws (retryable)', async () => {
      const { service, prisma, leyr, ghl } = makeService(
        makePrismaStub(),
        makeGhlStub(),
        makeLeyrStub(),
        makeConfigStub({
          SYNC_PRECHECK_TIMESLOTS: 'true',
          SYNC_CANCEL_GHL_ON_LEYR_REJECT: 'true',
        }),
      );
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (leyr.getTimeslots as jest.Mock).mockRejectedValue(
        new Error('Leyr timeslots 503'),
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.failedCount).toBe(1);
      expect(leyr.createAppointment).not.toHaveBeenCalled();
      expect(ghl.updateAppointment).not.toHaveBeenCalled();
      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('TIMESLOT_PRECHECK_FAILED'),
          }),
        }),
      );
    });

    it('dead-letters immediately on Tiden har redan bokats and cancels GHL', async () => {
      const { service, prisma, leyr, ghl, availabilitySync } = makeService(
        makePrismaStub(),
        makeGhlStub(),
        makeLeyrStub(),
        makeConfigStub({
          SYNC_PRECHECK_TIMESLOTS: 'false',
          SYNC_CANCEL_GHL_ON_LEYR_REJECT: 'true',
        }),
      );
      const syncRow = fakeSyncRow('GHL_TO_LEYR');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (leyr.createAppointment as jest.Mock).mockRejectedValue(
        new Error(
          'Unprocessable Entity | Details: {"errors":[{"detail":"Tiden har redan bokats"}]}',
        ),
      );
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});
      (ghl.updateAppointment as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.failedCount).toBe(1);
      expect(ghl.updateAppointment).toHaveBeenCalledWith(
        'ghl-ext-001',
        expect.objectContaining({ appointmentStatus: 'cancelled' }),
      );
      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'dead_letter',
          }),
        }),
      );
      expect(availabilitySync.syncAll).toHaveBeenCalledWith(
        'after-leyr-reject',
        {
          ghlLocationId: 'loc-001',
          ghlCalendarId: 'cal-001',
        },
      );
    });

    it('marks cancelled GHL update without link as success (no re-create)', async () => {
      const { service, prisma, leyr } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        sourceSystem: 'GHL:AppointmentUpdate',
        ghlAppointment: fakeGhlAppointment({ status: 'cancelled' }),
      });

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(leyr.createAppointment).not.toHaveBeenCalled();
    });

    it('mirrors Leyr→GHL as block slot only (no GHL patient appointment)', async () => {
      const { service, prisma, ghl, leyr, identity } = makeService(
        makePrismaStub(),
        makeGhlStub(),
        makeLeyrStub(),
        makeConfigStub({ SYNC_LEYR_TO_GHL_BLOCK_SLOTS_ONLY: 'true' }),
      );
      const syncRow = fakeSyncRow('LEYR_TO_GHL');

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([
        syncRow,
      ]);
      (prisma.appointmentSync.findUnique as jest.Mock).mockResolvedValue(
        syncRow,
      );
      (prisma.appointmentLink.findFirst as jest.Mock).mockResolvedValue(null);
      (ghl.createBlockSlot as jest.Mock).mockResolvedValue({ id: 'block-99' });
      (prisma.appointmentLink.create as jest.Mock).mockResolvedValue({});
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      const result = await service.syncAppointments('test');

      expect(result.syncedCount).toBe(1);
      expect(ghl.createAppointment).not.toHaveBeenCalled();
      expect(identity.resolveGhlContact).not.toHaveBeenCalled();
      expect(leyr.createAppointment).not.toHaveBeenCalled();
      expect(ghl.createBlockSlot).toHaveBeenCalled();
      expect(prisma.appointmentLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ghlAppointmentId: 'busy:leyr-ext-001',
            ghlBlockSlotId: 'block-99',
          }),
        }),
      );
    });
  });

  describe('batch processing', () => {
    it('processes up to 30 pending rows per batch', async () => {
      const { service, prisma } = makeService();

      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([]);

      await service.syncAppointments('batch-test');

      expect(prisma.appointmentSync.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
          take: 30,
        }),
      );
    });

    it('includes completedAt timestamp in result', async () => {
      const { service, prisma } = makeService();
      (prisma.appointmentSync.findMany as jest.Mock).mockResolvedValue([]);

      const before = new Date().toISOString();
      const result = await service.syncAppointments('test');
      const after = new Date().toISOString();

      expect(result.completedAt).toBeDefined();
      expect(result.completedAt >= before).toBe(true);
      expect(result.completedAt <= after).toBe(true);
    });
  });
});
