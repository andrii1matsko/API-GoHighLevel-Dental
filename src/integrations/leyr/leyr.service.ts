import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CreateLeyrAppointmentDto } from './dto/create-appointment.dto';
import { PrismaService } from '../../prisma/prisma.service';

type QueryValue = string | number | boolean | undefined;
type QueryParams = Record<string, QueryValue>;
interface CreateLeyrAppointmentOptions {
  enqueueSync?: boolean;
}

@Injectable()
export class LeyrService {
  private readonly logger = new Logger(LeyrService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly encryptionKey: string;
  private readonly emr: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'LEYR_API_BASE_URL',
      'https://api.leyr.io/api',
    );
    this.clientId = this.configService.get<string>('LEYR_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('LEYR_CLIENT_SECRET', '');
    this.encryptionKey = this.configService.get<string>(
      'LEYR_ENCRYPTION_KEY',
      '',
    );
    this.emr = this.configService.get<string>('LEYR_EMR', 'opus');
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'x-leyr-client-id': this.clientId,
      'x-leyr-client-secret': this.clientSecret,
      'Content-Type': 'application/json',
    };

    if (this.encryptionKey) {
      headers['x-leyr-encryption-key'] = this.encryptionKey;
    }

    return headers;
  }

  private assertCredentials() {
    if (!this.clientId || !this.clientSecret) {
      this.logger.error('Leyr credentials are missing in environment variables');
      throw new Error(
        'Leyr credentials are missing. Set LEYR_CLIENT_ID and LEYR_CLIENT_SECRET.',
      );
    }
  }

  private resolveEmr(emr?: string): string {
    return emr ?? this.emr;
  }

  private async get(path: string, params?: QueryParams): Promise<unknown> {
    this.assertCredentials();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, {
          headers: this.getHeaders(),
          params,
        }),
      );

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<Record<string, unknown>>;
      const status = axiosError.response?.status ?? 500;
      const data = axiosError.response?.data;
      const message =
        typeof data?.detail === 'string'
          ? data.detail
          : axiosError.message || 'Leyr API request failed';

      throw new HttpException(
        {
          message,
          status,
          leyr: data ?? null,
        },
        status,
      );
    }
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    this.assertCredentials();

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, payload, {
          headers: this.getHeaders(),
        }),
      );

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<Record<string, unknown>>;
      const status = axiosError.response?.status ?? 500;
      const data = axiosError.response?.data;
      const message =
        typeof data?.detail === 'string'
          ? data.detail
          : axiosError.message || 'Leyr API request failed';

      throw new HttpException(
        {
          message,
          status,
          leyr: data ?? null,
        },
        status,
      );
    }
  }

  private async getWithFallback(
    primaryPath: string,
    fallbackPath: string,
    params?: QueryParams,
  ): Promise<unknown> {
    try {
      return await this.get(primaryPath, params);
    } catch (error: unknown) {
      if (!(error instanceof HttpException)) {
        throw error;
      }

      const response = error.getResponse() as
        | { leyr?: { detail?: string }; message?: string }
        | undefined;
      const detail =
        response?.leyr?.detail ?? (typeof response?.message === 'string'
          ? response.message
          : '');
      const shouldFallback =
        error.getStatus() === 400 &&
        typeof detail === 'string' &&
        detail.includes("loc': ('path', 'emr')");

      if (!shouldFallback) {
        throw error;
      }

      return this.get(fallbackPath, params);
    }
  }

  getEmrs() {
    return this.get('/emrs');
  }

  getCareUnits(emr?: string) {
    return this.get(`/emrs/${this.resolveEmr(emr)}/care-units`);
  }

  findPatients(
    careUnitId: string,
    firstName?: string,
    lastName?: string,
    emr?: string,
  ) {
    const resolvedEmr = this.resolveEmr(emr);
    const params = {
      first_name: firstName,
      last_name: lastName,
      care_unit_id: careUnitId,
      emr: resolvedEmr,
    };

    return this.getWithFallback(
      `/emrs/${resolvedEmr}/care-units/${careUnitId}/patients`,
      '/patients',
      params,
    );
  }

  getPatient(careUnitId: string, patientId: string, emr?: string) {
    const resolvedEmr = this.resolveEmr(emr);
    return this.getWithFallback(
      `/emrs/${resolvedEmr}/care-units/${careUnitId}/patients/${patientId}`,
      `/patients/${patientId}`,
      {
        care_unit_id: careUnitId,
        emr: resolvedEmr,
      },
    );
  }

  getHealthcareServices(careUnitId: string, emr?: string) {
    return this.get(
      `/emrs/${this.resolveEmr(emr)}/care-units/${careUnitId}/healthcare-services`,
    );
  }

  getResources(careUnitId: string, emr?: string) {
    return this.get(`/emrs/${this.resolveEmr(emr)}/care-units/${careUnitId}/resources`);
  }

  getTimeslots(
    careUnitId: string,
    resourceId?: string,
    healthcareServiceId?: string,
    start?: string,
    end?: string,
    emr?: string,
  ) {
    return this.get(`/emrs/${this.resolveEmr(emr)}/care-units/${careUnitId}/timeslots`, {
      resource_id: resourceId,
      healthcare_service_id: healthcareServiceId,
      start,
      end,
    });
  }

  getAppointments(
    careUnitId: string,
    patientId?: string,
    start?: string,
    end?: string,
    emr?: string,
  ) {
    return this.get(`/emrs/${this.resolveEmr(emr)}/care-units/${careUnitId}/appointments`, {
      patient_id: patientId,
      start,
      end,
    });
  }

  getMedicalNotes(careUnitId: string, patientId: string, emr?: string) {
    return this.get(`/emrs/${this.resolveEmr(emr)}/medical-notes`, {
      care_unit_id: careUnitId,
      patient_id: patientId,
    });
  }

  createAppointment(
    careUnitId: string,
    payload: CreateLeyrAppointmentDto,
    emr?: string,
    options: CreateLeyrAppointmentOptions = {},
  ) {
    return this.post(
      `/emrs/${this.resolveEmr(emr)}/care-units/${careUnitId}/appointments`,
      payload,
    ).then(async (response) => {
      const appointments = Array.isArray(response)
        ? (response as Array<Record<string, unknown>>)
        : [];
      const first = appointments[0];
      if (!first) {
        return response;
      }

      const leyrAppointmentId = String(first.id ?? '');
      if (leyrAppointmentId) {
        const parsedStart = first.start ? new Date(String(first.start)) : null;
        const parsedEnd = first.end ? new Date(String(first.end)) : null;

        const persisted = await this.prismaService.leyrAppointment.upsert({
          where: { leyrAppointmentId },
          create: {
            leyrAppointmentId,
            emr: this.resolveEmr(emr),
            emrId: first.emr_id ? String(first.emr_id) : null,
            careUnitId: String(first.care_unit_id ?? careUnitId),
            patientId: payload.patient_id,
            resourceId: payload.resource_id,
            healthcareServiceId: payload.healthcare_service_id,
            startAt:
              parsedStart && !Number.isNaN(parsedStart.getTime())
                ? parsedStart
                : new Date(payload.start),
            endAt:
              parsedEnd && !Number.isNaN(parsedEnd.getTime())
                ? parsedEnd
                : new Date(payload.end),
            status: first.status ? String(first.status) : null,
            description: first.description ? String(first.description) : null,
            comment: first.comment ? String(first.comment) : payload.comment ?? null,
            participants: first.participants
              ? (first.participants as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            healthcareServices: first.healthcare_services
              ? (first.healthcare_services as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            rawPayload: first as Prisma.InputJsonValue,
          },
          update: {
            emr: this.resolveEmr(emr),
            emrId: first.emr_id ? String(first.emr_id) : null,
            careUnitId: String(first.care_unit_id ?? careUnitId),
            patientId: payload.patient_id,
            resourceId: payload.resource_id,
            healthcareServiceId: payload.healthcare_service_id,
            startAt:
              parsedStart && !Number.isNaN(parsedStart.getTime())
                ? parsedStart
                : new Date(payload.start),
            endAt:
              parsedEnd && !Number.isNaN(parsedEnd.getTime())
                ? parsedEnd
                : new Date(payload.end),
            status: first.status ? String(first.status) : null,
            description: first.description ? String(first.description) : null,
            comment: first.comment ? String(first.comment) : payload.comment ?? null,
            participants: first.participants
              ? (first.participants as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            healthcareServices: first.healthcare_services
              ? (first.healthcare_services as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            rawPayload: first as Prisma.InputJsonValue,
          },
        });

        if (options.enqueueSync ?? true) {
          const idempotencyKey = `LEYR_TO_GHL:${leyrAppointmentId}`;
          await this.prismaService.appointmentSync.upsert({
            where: { idempotencyKey },
            create: {
              idempotencyKey,
              direction: 'LEYR_TO_GHL',
              status: 'pending',
              sourceSystem: 'LEYR',
              sourceExternalId: leyrAppointmentId,
              targetSystem: 'GHL',
              leyrAppointmentId: persisted.id,
            },
            update: {
              status: 'pending',
              errorMessage: null,
            },
          });
        }
      }

      return response;
    });
  }
}
