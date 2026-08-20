import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { GohighlevelMockService } from './gohighlevel-mock.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaStub() {
  return {
    ghlOAuthToken: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    ghlAppointment: {
      upsert: jest.fn().mockResolvedValue({ id: 'db-id' }),
    },
    appointmentSync: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('GohighlevelMockService', () => {
  let service: GohighlevelMockService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = new GohighlevelMockService(prisma);
  });

  describe('getCalendars', () => {
    it('returns mock calendars', async () => {
      const result = await service.getCalendars({});
      expect(result.calendars).toBeInstanceOf(Array);
      expect(result.calendars.length).toBeGreaterThan(0);
      expect(result.calendars[0]).toHaveProperty('id');
      expect(result.calendars[0]).toHaveProperty('name');
    });
  });

  describe('getCalendarGroups', () => {
    it('returns mock groups', async () => {
      const result = await service.getCalendarGroups({});
      expect(result.groups).toBeInstanceOf(Array);
      expect(result.groups.length).toBeGreaterThan(0);
    });
  });

  describe('getCalendarServicesCatalog', () => {
    it('returns all services', async () => {
      const result = await service.getCalendarServicesCatalog({});
      expect(result.services.length).toBeGreaterThan(0);
    });

    it('filters by isPrivate', async () => {
      const publicResult = await service.getCalendarServicesCatalog({
        isPrivate: false,
      });
      const privateResult = await service.getCalendarServicesCatalog({
        isPrivate: true,
      });

      expect(publicResult.services.length).toBeGreaterThan(0);
      expect(privateResult.services.length).toBeGreaterThan(0);
      expect(publicResult.services.length + privateResult.services.length).toBe(
        3,
      );
    });
  });

  describe('createAppointment', () => {
    it('creates appointment and returns with mock id', async () => {
      const result = await service.createAppointment({
        contactId: 'contact-001',
        startTime: '2026-06-15T09:00:00+02:00',
        endTime: '2026-06-15T10:00:00+02:00',
      });

      expect(result).toHaveProperty('id');
      expect((result.id as string).startsWith('ghl-mock-')).toBe(true);
      expect(result.appointmentStatus).toBe('confirmed');
    });

    it('throws when contactId is missing', async () => {
      await expect(
        service.createAppointment({
          contactId: '',
          startTime: '2026-06-15T09:00:00+02:00',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws when startTime is missing', async () => {
      await expect(
        service.createAppointment({
          contactId: 'c-1',
          startTime: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('persists to Prisma and enqueues sync', async () => {
      await service.createAppointment({
        contactId: 'contact-001',
        startTime: '2026-06-15T09:00:00+02:00',
      });

      expect(prisma.ghlAppointment.upsert).toHaveBeenCalled();
      expect(prisma.appointmentSync.upsert).toHaveBeenCalled();
    });

    it('skips sync when enqueueSync=false', async () => {
      await service.createAppointment(
        { contactId: 'c-1', startTime: '2026-06-15T09:00:00+02:00' },
        { enqueueSync: false },
      );

      expect(prisma.appointmentSync.upsert).not.toHaveBeenCalled();
    });

    it('generates endTime when not provided', async () => {
      const result = await service.createAppointment({
        contactId: 'c-1',
        startTime: '2026-06-15T09:00:00Z',
      });

      expect(result.endTime).toBeDefined();
    });
  });

  describe('updateAppointment', () => {
    it('throws on empty eventId', async () => {
      await expect(
        service.updateAppointment('', { title: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteEvent', () => {
    it('throws on empty eventId', async () => {
      await expect(service.deleteEvent('', {})).rejects.toThrow(HttpException);
    });
  });

  describe('refreshAccessToken', () => {
    it('returns mock token response', async () => {
      const result = await service.refreshAccessToken({
        refreshToken: 'old-ref',
      });

      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBeGreaterThan(0);
      expect(result.refresh_token).toBeDefined();
    });
  });

  describe('storeOAuthToken', () => {
    it('persists token via Prisma', async () => {
      const result = await service.storeOAuthToken({
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresIn: 86399,
        userType: 'Location',
        companyId: 'comp-1',
        locationId: 'loc-1',
      });

      expect(result).toEqual({ stored: true });
      expect(prisma.ghlOAuthToken.upsert).toHaveBeenCalled();
    });
  });

  describe('getCalendarFreeSlots', () => {
    it('returns free slots for valid range', async () => {
      const start = new Date('2026-06-15').getTime();
      const end = new Date('2026-06-20').getTime();

      const result = await service.getCalendarFreeSlots('mock-cal-dental-01', {
        startDate: start,
        endDate: end,
      });

      expect(typeof result).toBe('object');
    });

    it('throws when endDate < startDate', async () => {
      await expect(
        service.getCalendarFreeSlots('cal-1', {
          startDate: 2000,
          endDate: 1000,
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws when range exceeds 31 days', async () => {
      const start = Date.now();
      const end = start + 32 * 24 * 60 * 60 * 1000;

      await expect(
        service.getCalendarFreeSlots('cal-1', {
          startDate: start,
          endDate: end,
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('webhook ingestion', () => {
    it('ingestAppointmentCreateWebhook persists and returns accepted', async () => {
      const result = await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-1',
        appointment: {
          id: 'wh-001',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startTime: '2026-06-15T09:00:00+02:00',
          endTime: '2026-06-15T10:00:00+02:00',
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.appointmentId).toBe('wh-001');
    });

    it('ingestAppointmentMutationWebhook handles update', async () => {
      const result = await service.ingestAppointmentMutationWebhook(
        {
          locationId: 'loc-1',
          appointment: { id: 'mut-001', calendarId: 'cal-1', contactId: 'c-1' },
        },
        'AppointmentUpdate',
      );

      expect(result.accepted).toBe(true);
    });
  });

  describe('getCalendarEvents', () => {
    it('throws when startTime/endTime missing', async () => {
      await expect(
        service.getCalendarEvents({
          startTime: '',
          endTime: '',
          calendarId: 'cal-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws when no filter provided', async () => {
      await expect(
        service.getCalendarEvents({
          startTime: '1000',
          endTime: '2000',
        }),
      ).rejects.toThrow(HttpException);
    });
  });
});
