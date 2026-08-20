import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GohighlevelService } from './gohighlevel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { of, throwError } from 'rxjs';
import {
  AxiosResponse,
  AxiosHeaders,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

function makeAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() } as InternalAxiosRequestConfig,
  };
}

function makeAxiosError(status: number, data: unknown): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: { headers: new AxiosHeaders() } as InternalAxiosRequestConfig,
  };
  return err;
}

function makeConfigStub(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    GHL_API_BASE_URL: 'https://services.leadconnectorhq.com',
    GHL_API_KEY: 'test-api-key',
    GHL_LOCATION_ID: 'test-loc-id',
    GHL_CALENDAR_ID: 'test-cal-id',
    GHL_CLIENT_ID: 'test-client-id',
    GHL_CLIENT_SECRET: 'test-client-secret',
    GHL_REDIRECT_URI: 'https://myapp.com/callback',
    GHL_OAUTH_USER_TYPE: 'Location',
    GHL_AGENCY_ACCESS_TOKEN: '',
    GHL_AGENCY_REFRESH_TOKEN: '',
    GHL_AGENCY_REFRESH_USER_TYPE: 'Company',
    GHL_TOKEN_REFRESH_LEEWAY_SECONDS: '300',
    GHL_COMPANY_ID: 'test-company-id',
    GHL_LOCATION_ID_OAUTH: 'test-loc-oauth',
    GHL_LOCATION_ACCESS_TOKEN: '',
    ...overrides,
  };

  return {
    get: jest.fn(
      (key: string, fallback?: unknown) => defaults[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
}

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

function createService(
  httpService = makeHttpStub(),
  configService = makeConfigStub(),
  prismaService = makePrismaStub(),
) {
  const storedToken = {
    accessToken: 'stored-access-token',
    accessTokenExpiresAt: new Date(Date.now() + 86400 * 1000),
    refreshToken: 'stored-refresh-token',
  };
  (prismaService.ghlOAuthToken.findUnique as jest.Mock).mockResolvedValue(
    storedToken,
  );

  return {
    service: new GohighlevelService(httpService, configService, prismaService),
    httpService,
    configService,
    prismaService,
  };
}

describe('GohighlevelService', () => {
  let httpService: HttpService;
  let prismaService: PrismaService;
  let service: GohighlevelService;

  beforeEach(() => {
    const result = createService();
    httpService = result.httpService;
    prismaService = result.prismaService;
    service = result.service;
  });

  describe('refreshAccessToken', () => {
    it('calls GHL OAuth endpoint with correct form data', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 86399,
            token_type: 'Bearer',
          }),
        ),
      );

      const result = await service.refreshAccessToken({
        refreshToken: 'old-refresh',
        userType: 'Location',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/token'),
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      expect(result.access_token).toBe('new-token');
    });

    it('throws HttpException when OAuth credentials are missing', async () => {
      const { service: svc } = createService(
        makeHttpStub(),
        makeConfigStub({ GHL_CLIENT_ID: '', GHL_CLIENT_SECRET: '' }),
      );

      await expect(
        svc.refreshAccessToken({ refreshToken: 'any' }),
      ).rejects.toThrow(HttpException);
    });

    it('throws HttpException on upstream error', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => makeAxiosError(401, 'Invalid token')),
      );

      await expect(
        service.refreshAccessToken({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('storeOAuthToken', () => {
    it('persists token via Prisma upsert', async () => {
      const result = await service.storeOAuthToken({
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresIn: 86399,
        userType: 'Location',
        companyId: 'comp-1',
        locationId: 'loc-1',
      });

      expect(result).toEqual({ stored: true });
      expect(prismaService.ghlOAuthToken.upsert).toHaveBeenCalled();
    });
  });

  describe('createAppointment', () => {
    it('throws when contactId is missing', async () => {
      await expect(
        service.createAppointment({
          contactId: '',
          startTime: '2026-06-15T09:00:00+02:00',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('throws when startTime is missing', async () => {
      await expect(
        service.createAppointment({
          contactId: 'c-1',
          startTime: '',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('creates appointment and persists to DB', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse({
            id: 'appt-001',
            calendarId: 'test-cal-id',
            locationId: 'test-loc-id',
            contactId: 'c-1',
            startTime: '2026-06-15T09:00:00+02:00',
            endTime: '2026-06-15T10:00:00+02:00',
          }),
        ),
      );

      const result = await service.createAppointment({
        contactId: 'c-1',
        startTime: '2026-06-15T09:00:00+02:00',
        endTime: '2026-06-15T10:00:00+02:00',
      });

      expect(result).toHaveProperty('id', 'appt-001');
      expect(prismaService.ghlAppointment.upsert).toHaveBeenCalled();
      expect(prismaService.appointmentSync.upsert).toHaveBeenCalled();
    });

    it('does not enqueue sync when enqueueSync=false', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse({
            id: 'appt-002',
            calendarId: 'test-cal-id',
            locationId: 'test-loc-id',
            contactId: 'c-1',
            startTime: '2026-06-15T09:00:00+02:00',
            endTime: '2026-06-15T10:00:00+02:00',
          }),
        ),
      );

      await service.createAppointment(
        {
          contactId: 'c-1',
          startTime: '2026-06-15T09:00:00+02:00',
        },
        { enqueueSync: false },
      );

      expect(prismaService.appointmentSync.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateAppointment', () => {
    it('throws when eventId is empty', async () => {
      await expect(
        service.updateAppointment('', { title: 'Updated' }),
      ).rejects.toThrow(HttpException);
    });

    it('updates appointment via PUT', async () => {
      (httpService.put as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse({
            id: 'appt-001',
            title: 'Updated Title',
          }),
        ),
      );

      const result = await service.updateAppointment('appt-001', {
        title: 'Updated Title',
      });

      expect(result).toHaveProperty('title', 'Updated Title');
    });
  });

  describe('deleteEvent', () => {
    it('throws when eventId is empty', async () => {
      await expect(service.deleteEvent('', {})).rejects.toThrow(HttpException);
    });

    it('deletes event via DELETE', async () => {
      (httpService.delete as jest.Mock).mockReturnValue(
        of(makeAxiosResponse({ succeeded: true })),
      );

      const result = await service.deleteEvent('event-001', {});

      expect(result).toEqual({ succeeded: true });
    });
  });

  describe('webhook ingestion', () => {
    it('ingestAppointmentCreateWebhook persists and queues sync', async () => {
      const result = await service.ingestAppointmentCreateWebhook({
        locationId: 'loc-1',
        appointment: {
          id: 'appt-wh-001',
          calendarId: 'cal-1',
          contactId: 'contact-1',
          startTime: '2026-06-15T09:00:00+02:00',
          endTime: '2026-06-15T10:00:00+02:00',
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.appointmentId).toBe('appt-wh-001');
      expect(result.queuedSync).toBe(true);
      expect(prismaService.ghlAppointment.upsert).toHaveBeenCalled();
      expect(prismaService.appointmentSync.upsert).toHaveBeenCalled();
    });

    it('ingestAppointmentCreateWebhook can skip sync when enqueueSync=false', async () => {
      const result = await service.ingestAppointmentCreateWebhook(
        {
          locationId: 'loc-1',
          appointment: {
            id: 'appt-wh-002',
            calendarId: 'cal-1',
            contactId: 'contact-1',
            startTime: '2026-06-15T09:00:00+02:00',
            endTime: '2026-06-15T10:00:00+02:00',
          },
        },
        { enqueueSync: false },
      );

      expect(result.queuedSync).toBe(false);
      expect(prismaService.appointmentSync.upsert).not.toHaveBeenCalled();
    });

    it('ingestAppointmentMutationWebhook handles update type', async () => {
      const result = await service.ingestAppointmentMutationWebhook(
        {
          locationId: 'loc-1',
          appointment: {
            id: 'appt-mut-001',
            calendarId: 'cal-1',
            contactId: 'contact-1',
          },
        },
        'AppointmentUpdate',
      );

      expect(result.accepted).toBe(true);
      expect(result.appointmentId).toBe('appt-mut-001');
    });

    it('ingestAppointmentMutationWebhook handles delete type', async () => {
      const result = await service.ingestAppointmentMutationWebhook(
        {
          locationId: 'loc-1',
          appointment: {
            id: 'appt-mut-002',
            calendarId: 'cal-1',
            contactId: 'contact-1',
          },
        },
        'AppointmentDelete',
      );

      expect(result.accepted).toBe(true);
    });
  });

  describe('getCalendars', () => {
    it('fetches calendars with locationId', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse({ calendars: [{ id: 'cal-1' }] })),
      );

      const result = await service.getCalendars({ locationId: 'loc-1' });

      expect(result).toEqual({ calendars: [{ id: 'cal-1' }] });
    });
  });

  describe('getCalendarEvents', () => {
    it('throws when startTime/endTime missing', async () => {
      await expect(
        service.getCalendarEvents({
          locationId: 'loc-1',
          startTime: '',
          endTime: '',
          calendarId: 'cal-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws when no userId/groupId/calendarId', async () => {
      await expect(
        service.getCalendarEvents({
          locationId: 'loc-1',
          startTime: '1000',
          endTime: '2000',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getCalendarFreeSlots', () => {
    it('throws when calendarId is empty', async () => {
      await expect(
        service.getCalendarFreeSlots('', {
          startDate: 1000,
          endDate: 2000,
        }),
      ).rejects.toThrow(HttpException);
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

  describe('getAppointmentById', () => {
    it('throws when eventId is empty', async () => {
      await expect(service.getAppointmentById('', {})).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getCalendarById', () => {
    it('throws when calendarId is empty', async () => {
      await expect(service.getCalendarById('', {})).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('createLocationAccessToken', () => {
    it('calls GHL location token endpoint', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse({
            access_token: 'loc-tok',
            expires_in: 86399,
            token_type: 'Bearer',
          }),
        ),
      );

      const result = await service.createLocationAccessToken({
        companyId: 'comp-1',
        locationId: 'loc-1',
        agencyAccessToken: 'agency-tok',
      });

      expect(result.access_token).toBe('loc-tok');
    });
  });
});
