import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { GohighlevelService } from './gohighlevel.service';
import { GohighlevelController } from './gohighlevel.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CalendarSyncService } from '../../sync/calendar-sync.service';

function makePrismaStub() {
  return {
    ghlOAuthToken: {
      findUnique: jest.fn().mockResolvedValue(null),
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

function makeHttpStub() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as HttpService;
}

function makeConfigStub() {
  const defaults: Record<string, string> = {
    GHL_API_BASE_URL: 'https://services.leadconnectorhq.com',
    GHL_API_KEY: 'test-key',
    GHL_LOCATION_ID: 'test-loc',
    GHL_CALENDAR_ID: 'test-cal',
    GHL_CLIENT_ID: 'client-id',
    GHL_CLIENT_SECRET: 'client-secret',
    GHL_REDIRECT_URI: 'https://app.com/cb',
    GHL_OAUTH_USER_TYPE: 'Location',
    GHL_AGENCY_ACCESS_TOKEN: '',
    GHL_AGENCY_REFRESH_TOKEN: '',
    GHL_AGENCY_REFRESH_USER_TYPE: 'Company',
    GHL_TOKEN_REFRESH_LEEWAY_SECONDS: '300',
    GHL_COMPANY_ID: 'comp-id',
    GHL_LOCATION_ID_OAUTH: 'loc-oauth',
    GHL_LOCATION_ACCESS_TOKEN: '',
    SYNC_IMMEDIATE_ON_WEBHOOK: 'false',
  };
  return {
    get: jest.fn(
      (key: string, fallback?: unknown) => defaults[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
}

describe('GoHighLevel Webhook Edge Cases', () => {
  let service: GohighlevelService;
  let controller: GohighlevelController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrismaStub();
    const config = makeConfigStub();
    service = new GohighlevelService(makeHttpStub(), config, prisma);
    const calendarSync = {
      syncAppointments: jest.fn().mockResolvedValue({}),
    } as unknown as CalendarSyncService;
    controller = new GohighlevelController(service, calendarSync, config);
  });

  describe('duplicate webhook deliveries', () => {
    it('handles same AppointmentCreate webhook received twice', async () => {
      const payload = {
        type: 'AppointmentCreate' as const,
        locationId: 'loc-1',
        appointment: {
          id: 'dup-appt-001',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startTime: '2026-06-15T09:00:00+02:00',
          endTime: '2026-06-15T10:00:00+02:00',
        },
      };

      const result1 = await controller.appointmentCreateWebhook(payload);
      const result2 = await controller.appointmentCreateWebhook(payload);

      expect(result1.accepted).toBe(true);
      expect(result2.accepted).toBe(true);
      expect(prisma.ghlAppointment.upsert).toHaveBeenCalledTimes(2);
    });

    it('handles same AppointmentUpdate webhook received twice', async () => {
      const payload = {
        type: 'AppointmentUpdate' as const,
        locationId: 'loc-1',
        appointment: {
          id: 'dup-appt-002',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startTime: '2026-06-15T11:00:00+02:00',
          endTime: '2026-06-15T12:00:00+02:00',
        },
      };

      const result1 = await controller.appointmentUpdateWebhook(payload);
      const result2 = await controller.appointmentUpdateWebhook(payload);

      expect(result1.accepted).toBe(true);
      expect(result2.accepted).toBe(true);
    });
  });

  describe('webhook type mismatch', () => {
    it('rejects delete webhook sent to update endpoint', async () => {
      const payload = {
        type: 'AppointmentDelete' as const,
        locationId: 'loc-1',
        appointment: {
          id: 'misroute-001',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startTime: '2026-06-15T09:00:00+02:00',
          endTime: '2026-06-15T10:00:00+02:00',
        },
      };

      const result = await controller.appointmentUpdateWebhook(payload as any);

      expect(result).toEqual({
        accepted: false,
        reason: 'Wrong webhook type for endpoint',
      });
    });

    it('rejects update webhook sent to delete endpoint', async () => {
      const payload = {
        type: 'AppointmentUpdate' as const,
        locationId: 'loc-1',
        appointment: {
          id: 'misroute-002',
          calendarId: 'cal-1',
          contactId: 'c-1',
          startTime: '2026-06-15T09:00:00+02:00',
          endTime: '2026-06-15T10:00:00+02:00',
        },
      };

      const result = await controller.appointmentDeleteWebhook(payload as any);

      expect(result).toEqual({
        accepted: false,
        reason: 'Wrong webhook type for endpoint',
      });
    });
  });

  describe('webhook with minimal/missing optional fields', () => {
    it('accepts webhook with only required fields', async () => {
      const result = await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-1',
        appointment: {
          id: 'minimal-001',
        },
      });

      expect(result.accepted).toBe(true);
      expect(prisma.ghlAppointment.upsert).toHaveBeenCalled();
    });

    it('handles appointment with empty string fields', async () => {
      const result = await service.ingestAppointmentCreateWebhook({
        locationId: '',
        appointment: {
          id: 'empty-fields-001',
          locationId: 'loc-fallback',
          calendarId: '',
          contactId: '',
          startTime: '',
          endTime: '',
        },
      });

      expect(result.accepted).toBe(true);
    });
  });

  describe('Sweden/Norway timezone in webhooks', () => {
    it('correctly persists Sweden summer time appointment from webhook', async () => {
      await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-se',
        appointment: {
          id: 'se-summer-wh',
          calendarId: 'cal-se',
          contactId: 'c-se',
          startTime: '2026-07-15T09:00:00+02:00',
          endTime: '2026-07-15T10:00:00+02:00',
        },
      });

      const upsertCall = (prisma.ghlAppointment.upsert as jest.Mock).mock
        .calls[0] as [{ create: { startAt: Date | null } }];
      const startAt = upsertCall[0].create.startAt;
      expect(startAt).toBeDefined();
      if (startAt) {
        expect(startAt.getUTCHours()).toBe(7);
      }
    });

    it('correctly persists Norway winter time appointment from webhook', async () => {
      await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-no',
        appointment: {
          id: 'no-winter-wh',
          calendarId: 'cal-no',
          contactId: 'c-no',
          startTime: '2026-01-20T10:00:00+01:00',
          endTime: '2026-01-20T11:00:00+01:00',
        },
      });

      const upsertCall = (prisma.ghlAppointment.upsert as jest.Mock).mock
        .calls[0] as [{ create: { startAt: Date | null } }];
      const startAt = upsertCall[0].create.startAt;
      expect(startAt).toBeDefined();
      if (startAt) {
        expect(startAt.getUTCHours()).toBe(9);
      }
    });
  });

  describe('idempotency key generation', () => {
    it('generates unique idempotency keys for different actions on same appointment', async () => {
      await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-1',
        appointment: { id: 'idem-001', calendarId: 'cal-1', contactId: 'c-1' },
      });

      await service.ingestAppointmentMutationWebhook(
        {
          locationId: 'loc-1',
          appointment: {
            id: 'idem-001',
            calendarId: 'cal-1',
            contactId: 'c-1',
          },
        },
        'AppointmentUpdate',
      );

      const calls = (prisma.appointmentSync.upsert as jest.Mock).mock
        .calls as Array<[{ where: { idempotencyKey: string } }]>;
      const keys = calls.map((c) => c[0].where.idempotencyKey);
      expect(keys[0]).not.toBe(keys[1]);
      expect(keys[0]).toContain('AppointmentCreate');
      expect(keys[1]).toContain('AppointmentUpdate');
    });
  });
});
