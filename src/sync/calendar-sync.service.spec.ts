import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncService } from './calendar-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';

function makePrismaStub() {
  return {
    appointmentSync: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    leyrAppointment: {
      findUnique: jest.fn(),
    },
    ghlAppointment: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
}

function makeGhlStub() {
  return {
    createAppointment: jest.fn(),
  } as unknown as GohighlevelService;
}

function makeLeyrStub() {
  return {
    createAppointment: jest.fn(),
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
    GHL_LOCATION_ID_OAUTH: '',
    GHL_LOCATION_ID: '',
    GHL_CALENDAR_ID: '',
    ...overrides,
  };

  return {
    get: jest.fn(
      (key: string, fallback?: string) => defaults[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
}

function makeService(
  prisma = makePrismaStub(),
  ghl = makeGhlStub(),
  leyr = makeLeyrStub(),
  config = makeConfigStub(),
) {
  return {
    service: new CalendarSyncService(prisma, ghl, leyr, config),
    prisma,
    ghl,
    leyr,
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
    it('marks AppointmentUpdate as failed (not implemented)', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        sourceSystem: 'GHL:AppointmentUpdate',
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
            errorMessage: expect.stringContaining(
              'AppointmentUpdate not implemented',
            ),
          }),
        }),
      );
    });

    it('marks AppointmentDelete as failed (not implemented)', async () => {
      const { service, prisma } = makeService();
      const syncRow = fakeSyncRow('GHL_TO_LEYR', {
        sourceSystem: 'GHL:AppointmentDelete',
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
            errorMessage: expect.stringContaining(
              'AppointmentDelete not implemented',
            ),
          }),
        }),
      );
    });

    it('fails when default Leyr config values are missing', async () => {
      const config = makeConfigStub({
        SYNC_LEYR_DEFAULT_CARE_UNIT_ID: '',
        SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID: '',
        SYNC_LEYR_DEFAULT_RESOURCE_ID: '',
      });
      const { service, prisma } = makeService(
        undefined,
        undefined,
        undefined,
        config,
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
            errorMessage: expect.stringContaining('SYNC_LEYR_DEFAULT'),
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
          start: ghlAppt.startAt.toISOString(),
          end: ghlAppt.endAt.toISOString(),
          healthcare_service_id: 'hs-001',
          resource_id: 'res-001',
          patient_id: 'contact-001',
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
    it('fails when default GHL config values are missing', async () => {
      const config = makeConfigStub({
        SYNC_GHL_DEFAULT_CONTACT_ID: '',
        SYNC_GHL_DEFAULT_LOCATION_ID: '',
        SYNC_GHL_DEFAULT_CALENDAR_ID: '',
      });
      const { service, prisma } = makeService(
        undefined,
        undefined,
        undefined,
        config,
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
            errorMessage: expect.stringContaining('SYNC_GHL_DEFAULT'),
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
          title: expect.stringContaining('Synced from Leyr'),
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
      });
      (prisma.appointmentSync.update as jest.Mock).mockResolvedValue({});

      await service.syncAppointments('test');

      expect(prisma.appointmentSync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retryCount: { increment: 1 },
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
          where: { status: 'pending' },
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
