import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeyrService } from './leyr.service';
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
    LEYR_API_BASE_URL: 'https://api.leyr.io/api',
    LEYR_CLIENT_ID: 'test-client-id',
    LEYR_CLIENT_SECRET: 'test-client-secret',
    LEYR_ENCRYPTION_KEY: 'test-enc-key',
    LEYR_EMR: 'opus',
    ...overrides,
  };

  return {
    get: jest.fn(
      (key: string, fallback?: string) => defaults[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
}

function makePrismaStub() {
  return {
    leyrAppointment: {
      upsert: jest.fn().mockResolvedValue({ id: 'db-leyr-1' }),
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
  } as unknown as HttpService;
}

function createService(
  httpService = makeHttpStub(),
  configService = makeConfigStub(),
  prismaService = makePrismaStub(),
) {
  return {
    service: new LeyrService(httpService, configService, prismaService),
    httpService,
    prismaService,
  };
}

describe('LeyrService', () => {
  let httpService: HttpService;
  let prismaService: PrismaService;
  let service: LeyrService;

  beforeEach(() => {
    const result = createService();
    httpService = result.httpService;
    prismaService = result.prismaService;
    service = result.service;
  });

  describe('credential validation', () => {
    it('throws when client credentials are missing', async () => {
      const { service: svc } = createService(
        makeHttpStub(),
        makeConfigStub({ LEYR_CLIENT_ID: '', LEYR_CLIENT_SECRET: '' }),
      );

      await expect(svc.getEmrs()).rejects.toThrow(
        'Leyr credentials are missing',
      );
    });
  });

  describe('getEmrs', () => {
    it('fetches EMR list from Leyr API', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([{ id: 'opus', name: 'Opus Dental' }])),
      );

      const result = await service.getEmrs();

      expect(result).toEqual([{ id: 'opus', name: 'Opus Dental' }]);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.leyr.io/api/emrs',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-leyr-client-id': 'test-client-id',
            'x-leyr-client-secret': 'test-client-secret',
            'x-leyr-encryption-key': 'test-enc-key',
          }),
        }),
      );
    });
  });

  describe('getCareUnits', () => {
    it('uses default EMR when none provided', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([{ id: 'cu-1' }])),
      );

      await service.getCareUnits();

      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.leyr.io/api/emrs/opus/care-units',
        expect.anything(),
      );
    });

    it('uses provided EMR override', async () => {
      (httpService.get as jest.Mock).mockReturnValue(of(makeAxiosResponse([])));

      await service.getCareUnits('muntra');

      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.leyr.io/api/emrs/muntra/care-units',
        expect.anything(),
      );
    });
  });

  describe('findPatients', () => {
    it('sends query params for filtering', async () => {
      (httpService.get as jest.Mock).mockReturnValue(of(makeAxiosResponse([])));

      await service.findPatients('cu-1', 'Erik', 'Johansson');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/care-units/cu-1/patients'),
        expect.objectContaining({
          params: expect.objectContaining({
            first_name: 'Erik',
            last_name: 'Johansson',
            care_unit_id: 'cu-1',
          }),
        }),
      );
    });

    it('falls back to /patients when EMR path returns 400', async () => {
      const error400 = new HttpException(
        {
          message: 'Bad request',
          status: 400,
          leyr: { detail: "loc': ('path', 'emr')" },
        },
        400,
      );

      (httpService.get as jest.Mock)
        .mockReturnValueOnce(
          throwError(() => {
            const axErr = makeAxiosError(400, {
              detail: "loc': ('path', 'emr')",
            });
            return axErr;
          }),
        )
        .mockReturnValueOnce(of(makeAxiosResponse([{ id: 'pat-1' }])));

      const result = await service.findPatients('cu-1');

      expect(result).toEqual([{ id: 'pat-1' }]);
    });
  });

  describe('getHealthcareServices', () => {
    it('fetches services for a care unit', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([{ id: 'svc-1', name: 'Cleaning' }])),
      );

      const result = await service.getHealthcareServices('cu-1');

      expect(result).toEqual([{ id: 'svc-1', name: 'Cleaning' }]);
    });
  });

  describe('getResources', () => {
    it('fetches resources for a care unit', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([{ id: 'res-1', name: 'Dr. A' }])),
      );

      const result = await service.getResources('cu-1');

      expect(result).toEqual([{ id: 'res-1', name: 'Dr. A' }]);
    });
  });

  describe('getTimeslots', () => {
    it('passes all filter params', async () => {
      (httpService.get as jest.Mock).mockReturnValue(of(makeAxiosResponse([])));

      await service.getTimeslots(
        'cu-1',
        'res-1',
        'hs-1',
        '2026-06-01',
        '2026-06-30',
      );

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/timeslots'),
        expect.objectContaining({
          params: expect.objectContaining({
            resource_id: 'res-1',
            healthcare_service_id: 'hs-1',
            start: '2026-06-01',
            end: '2026-06-30',
          }),
        }),
      );
    });
  });

  describe('getAppointments', () => {
    it('fetches appointments for care unit with filters', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([{ id: 'appt-1' }])),
      );

      const result = await service.getAppointments(
        'cu-1',
        'pat-1',
        '2026-06-01',
        '2026-06-30',
      );

      expect(result).toEqual([{ id: 'appt-1' }]);
    });
  });

  describe('createAppointment', () => {
    const validPayload = {
      start: '2026-06-15T09:00:00+02:00',
      end: '2026-06-15T10:00:00+02:00',
      healthcare_service_id: 'hs-001',
      resource_id: 'res-001',
      patient_id: 'pat-001',
      comment: 'Test appointment',
    };

    it('creates appointment and persists to DB', async () => {
      const apiResponse = [
        {
          id: 'leyr-new-001',
          emr_id: 'opus-emr-001',
          care_unit_id: 'cu-1',
          start: '2026-06-15T09:00:00+02:00',
          end: '2026-06-15T10:00:00+02:00',
          status: 'booked',
          description: null,
          comment: 'Test appointment',
          participants: [{ id: 'res-001', type: 'practitioner' }],
          healthcare_services: [{ id: 'hs-001' }],
        },
      ];

      (httpService.post as jest.Mock).mockReturnValue(
        of(makeAxiosResponse(apiResponse)),
      );

      const result = await service.createAppointment('cu-1', validPayload);

      expect(result).toEqual(apiResponse);
      expect(prismaService.leyrAppointment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leyrAppointmentId: 'leyr-new-001' },
        }),
      );
    });

    it('enqueues LEYR_TO_GHL sync by default', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse([
            {
              id: 'leyr-new-002',
              start: '2026-06-15T09:00:00Z',
              end: '2026-06-15T10:00:00Z',
            },
          ]),
        ),
      );

      await service.createAppointment('cu-1', validPayload);

      expect(prismaService.appointmentSync.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idempotencyKey: 'LEYR_TO_GHL:leyr-new-002' },
          create: expect.objectContaining({
            direction: 'LEYR_TO_GHL',
            status: 'pending',
            sourceSystem: 'LEYR',
          }),
        }),
      );
    });

    it('skips sync enqueue when enqueueSync=false', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse([
            {
              id: 'leyr-new-003',
              start: '2026-06-15T09:00:00Z',
              end: '2026-06-15T10:00:00Z',
            },
          ]),
        ),
      );

      await service.createAppointment('cu-1', validPayload, undefined, {
        enqueueSync: false,
      });

      expect(prismaService.appointmentSync.upsert).not.toHaveBeenCalled();
    });

    it('handles API returning empty array gracefully', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(makeAxiosResponse([])),
      );

      const result = await service.createAppointment('cu-1', validPayload);

      expect(result).toEqual([]);
      expect(prismaService.leyrAppointment.upsert).not.toHaveBeenCalled();
    });

    it('handles API returning non-array response', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(makeAxiosResponse({ status: 'created' })),
      );

      const result = await service.createAppointment('cu-1', validPayload);

      expect(result).toEqual({ status: 'created' });
    });

    it('persists with fallback dates when API dates are invalid', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          makeAxiosResponse([
            {
              id: 'leyr-bad-dates',
              start: 'not-a-date',
              end: 'also-not-a-date',
              care_unit_id: 'cu-1',
            },
          ]),
        ),
      );

      await service.createAppointment('cu-1', validPayload);

      expect(prismaService.leyrAppointment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            startAt: new Date(validPayload.start),
            endAt: new Date(validPayload.end),
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('wraps Axios errors into HttpException with status and detail', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        throwError(() => makeAxiosError(404, { detail: 'EMR not found' })),
      );

      try {
        await service.getEmrs();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpErr = error as HttpException;
        expect(httpErr.getStatus()).toBe(404);
        const response = httpErr.getResponse() as Record<string, unknown>;
        expect(response.message).toBe('EMR not found');
      }
    });

    it('defaults to 500 when Axios error has no response', async () => {
      const err = new AxiosError('Network error');

      (httpService.get as jest.Mock).mockReturnValue(throwError(() => err));

      try {
        await service.getEmrs();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(500);
      }
    });

    it('post errors are wrapped correctly', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() =>
          makeAxiosError(422, { detail: 'Invalid appointment data' }),
        ),
      );

      await expect(
        service.createAppointment('cu-1', {
          start: '2026-06-15T09:00:00Z',
          end: '2026-06-15T10:00:00Z',
          healthcare_service_id: 'hs-1',
          resource_id: 'res-1',
          patient_id: 'pat-1',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getHeaders', () => {
    it('includes encryption key when set', async () => {
      (httpService.get as jest.Mock).mockReturnValue(of(makeAxiosResponse([])));

      await service.getEmrs();

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-leyr-encryption-key': 'test-enc-key',
          }),
        }),
      );
    });

    it('omits encryption key when empty', async () => {
      const { service: svc, httpService: http } = createService(
        makeHttpStub(),
        makeConfigStub({ LEYR_ENCRYPTION_KEY: '' }),
      );
      (http.get as jest.Mock).mockReturnValue(of(makeAxiosResponse([])));

      await svc.getEmrs();

      const callArgs = (http.get as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(callArgs[1].headers).not.toHaveProperty('x-leyr-encryption-key');
    });
  });
});
