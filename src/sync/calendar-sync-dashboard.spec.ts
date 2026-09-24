import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncService } from './calendar-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { GohighlevelService } from '../integrations/gohighlevel/gohighlevel.service';
import { LeyrService } from '../integrations/leyr/leyr.service';
import { IdentityResolverService } from './identity-resolver.service';
import { ServiceMappingResolverService } from './service-mapping-resolver.service';
import { GhlAvailabilitySyncService } from './ghl-availability-sync.service';

describe('CalendarSyncService – Dashboard endpoints', () => {
  let service: CalendarSyncService;
  let prisma: jest.Mocked<PrismaService>;

  const fakePrisma = {
    appointmentSync: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: GohighlevelService, useValue: {} },
        { provide: LeyrService, useValue: {} },
        { provide: IdentityResolverService, useValue: {} },
        { provide: ServiceMappingResolverService, useValue: {} },
        {
          provide: GhlAvailabilitySyncService,
          useValue: { syncAll: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get(CalendarSyncService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSyncStatus()', () => {
    it('returns summary counts and direction breakdown', async () => {
      fakePrisma.appointmentSync.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(90) // success
        .mockResolvedValueOnce(5) // failed
        .mockResolvedValueOnce(100); // total

      fakePrisma.appointmentSync.groupBy.mockResolvedValueOnce([
        { direction: 'GHL_TO_LEYR', status: 'success', _count: 50 },
        { direction: 'GHL_TO_LEYR', status: 'failed', _count: 3 },
        { direction: 'LEYR_TO_GHL', status: 'success', _count: 40 },
        { direction: 'LEYR_TO_GHL', status: 'pending', _count: 5 },
        { direction: 'LEYR_TO_GHL', status: 'failed', _count: 2 },
      ]);

      const result = await service.getSyncStatus();

      expect(result.total).toBe(100);
      expect(result.pending).toBe(5);
      expect(result.success).toBe(90);
      expect(result.failed).toBe(5);
      expect(result.byDirection).toEqual({
        GHL_TO_LEYR: { success: 50, failed: 3 },
        LEYR_TO_GHL: { success: 40, pending: 5, failed: 2 },
      });
      expect(result.queriedAt).toBeDefined();
    });

    it('returns zeros when no sync rows exist', async () => {
      fakePrisma.appointmentSync.count.mockResolvedValue(0);
      fakePrisma.appointmentSync.groupBy.mockResolvedValue([]);

      const result = await service.getSyncStatus();

      expect(result.total).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.byDirection).toEqual({});
    });
  });

  describe('getSyncHistory()', () => {
    it('returns paginated results with default page/limit', async () => {
      const fakeRows = [
        {
          id: 'row-1',
          direction: 'GHL_TO_LEYR',
          status: 'success',
          sourceSystem: 'GHL:AppointmentCreate',
          sourceExternalId: 'ghl-123',
          targetSystem: 'LEYR',
          targetExternalId: 'leyr-456',
          idempotencyKey: 'key-1',
          errorMessage: null,
          retryCount: 0,
          syncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce(fakeRows);
      fakePrisma.appointmentSync.count.mockResolvedValueOnce(1);

      const result = await service.getSyncHistory({});

      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('applies status and direction filters', async () => {
      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce([]);
      fakePrisma.appointmentSync.count.mockResolvedValueOnce(0);

      await service.getSyncHistory({
        status: 'failed',
        direction: 'LEYR_TO_GHL',
        page: 2,
        limit: 10,
      });

      expect(fakePrisma.appointmentSync.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
            direction: 'LEYR_TO_GHL',
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('applies date range filters', async () => {
      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce([]);
      fakePrisma.appointmentSync.count.mockResolvedValueOnce(0);

      const from = '2026-01-01T00:00:00Z';
      const to = '2026-12-31T23:59:59Z';
      await service.getSyncHistory({ from, to });

      const callArgs = fakePrisma.appointmentSync.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toEqual(new Date(from));
      expect(callArgs.where.createdAt.lte).toEqual(new Date(to));
    });

    it('applies sourceSystem contains filter', async () => {
      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce([]);
      fakePrisma.appointmentSync.count.mockResolvedValueOnce(0);

      await service.getSyncHistory({ sourceSystem: 'GHL' });

      const callArgs = fakePrisma.appointmentSync.findMany.mock.calls[0][0];
      expect(callArgs.where.sourceSystem).toEqual({ contains: 'GHL' });
    });
  });

  describe('getSyncHealth()', () => {
    it('returns healthy status when no failures', async () => {
      fakePrisma.appointmentSync.count
        .mockResolvedValueOnce(50) // totalAll
        .mockResolvedValueOnce(50) // successAll
        .mockResolvedValueOnce(0) // failedAll
        .mockResolvedValueOnce(0) // pendingAll
        .mockResolvedValueOnce(5) // lastHourTotal
        .mockResolvedValueOnce(5) // lastHourSuccess
        .mockResolvedValueOnce(0) // lastHourFailed
        .mockResolvedValueOnce(20) // last24hTotal
        .mockResolvedValueOnce(20) // last24hSuccess
        .mockResolvedValueOnce(0); // last24hFailed

      fakePrisma.appointmentSync.findFirst
        .mockResolvedValueOnce({
          syncedAt: new Date('2026-06-15T12:00:00Z'),
          direction: 'GHL_TO_LEYR',
          status: 'success',
        })
        .mockResolvedValueOnce(null); // no pending

      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce([]);

      const result = await service.getSyncHealth();

      expect(result.status).toBe('healthy');
      expect(result.allTime.total).toBe(50);
      expect(result.allTime.successRate).toBe(100);
      expect(result.lastHour.successRate).toBe(100);
      expect(result.last24Hours.successRate).toBe(100);
      expect(result.lastSuccessfulSync).toBe('2026-06-15T12:00:00.000Z');
      expect(result.oldestPendingAge).toBeNull();
      expect(result.recentFailures).toEqual([]);
    });

    it('returns warning status when failures exist', async () => {
      fakePrisma.appointmentSync.count
        .mockResolvedValueOnce(100) // totalAll
        .mockResolvedValueOnce(90) // successAll
        .mockResolvedValueOnce(5) // failedAll
        .mockResolvedValueOnce(5) // pendingAll
        .mockResolvedValueOnce(0) // lastHourTotal
        .mockResolvedValueOnce(0) // lastHourSuccess
        .mockResolvedValueOnce(0) // lastHourFailed
        .mockResolvedValueOnce(10) // last24hTotal
        .mockResolvedValueOnce(8) // last24hSuccess
        .mockResolvedValueOnce(2); // last24hFailed

      fakePrisma.appointmentSync.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 60000),
        });

      const recentFailures = [
        {
          id: 'fail-1',
          direction: 'GHL_TO_LEYR',
          sourceSystem: 'GHL',
          sourceExternalId: 'ext-1',
          errorMessage: 'Some error',
          retryCount: 1,
          createdAt: new Date(),
        },
      ];
      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce(recentFailures);

      const result = await service.getSyncHealth();

      expect(result.status).toBe('warning');
      expect(result.allTime.failed).toBe(5);
      expect(result.oldestPendingAge).toBeDefined();
      expect(result.oldestPendingAge!.ms).toBeGreaterThan(0);
      expect(result.recentFailures).toHaveLength(1);
    });

    it('returns degraded status when too many pending rows', async () => {
      fakePrisma.appointmentSync.count
        .mockResolvedValueOnce(200) // totalAll
        .mockResolvedValueOnce(100) // successAll
        .mockResolvedValueOnce(0) // failedAll
        .mockResolvedValueOnce(100) // pendingAll >= 50 => degraded
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      fakePrisma.appointmentSync.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 3600000) });

      fakePrisma.appointmentSync.findMany.mockResolvedValueOnce([]);

      const result = await service.getSyncHealth();

      expect(result.status).toBe('degraded');
    });

    it('returns null success rate when no data in time window', async () => {
      fakePrisma.appointmentSync.count.mockResolvedValue(0);
      fakePrisma.appointmentSync.findFirst.mockResolvedValue(null);
      fakePrisma.appointmentSync.findMany.mockResolvedValue([]);

      const result = await service.getSyncHealth();

      expect(result.lastHour.successRate).toBeNull();
      expect(result.last24Hours.successRate).toBeNull();
      expect(result.allTime.successRate).toBe(0);
    });
  });
});
