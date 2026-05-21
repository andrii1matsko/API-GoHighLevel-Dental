import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GhlOAuthToken, Prisma } from '@prisma/client';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { RefreshGohighlevelTokenDto } from './dto/refresh-token.dto';
import { CreateLocationTokenDto } from './dto/location-token.dto';
import { StoreGohighlevelTokenDto } from './dto/store-token.dto';
import {
  CreateAppointmentDto,
  CreateBlockSlotDto,
  DeleteEventDto,
  GetCalendarEventsQueryDto,
  GetCalendarFreeSlotsQueryDto,
  GetCalendarServiceLocationsQueryDto,
  GetCalendarServicesQueryDto,
  GetCalendarsQueryDto,
  GohighlevelAccessTokenQueryDto,
  GohighlevelLocationScopedQueryDto,
  UpdateAppointmentDto,
  UpdateBlockSlotDto,
} from './dto/calendars.dto';
import {
  CreateContactDto,
  DeleteContactQueryDto,
  GetContactQueryDto,
  SearchContactsByNameDto,
  SearchContactsDto,
} from './dto/contacts.dto';

export interface ExternalAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  patientName?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtUnix: number;
}

interface CreateGhlAppointmentOptions {
  enqueueSync?: boolean;
}

const AGENCY_LOCATION_SCOPE = '__agency__';

@Injectable()
export class GohighlevelService {
  private readonly logger = new Logger(GohighlevelService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly locationId: string;
  private readonly calendarId: string;
  private readonly oauthClientId: string;
  private readonly oauthClientSecret: string;
  private readonly oauthRedirectUri: string;
  private readonly oauthUserType: 'Company' | 'Location';
  private readonly agencyAccessToken: string;
  private readonly agencyRefreshUserType: 'Company' | 'Location';
  private readonly tokenRefreshLeewaySeconds: number;
  private readonly oauthCompanyId: string;
  private readonly oauthLocationId: string;
  private readonly locationAccessToken: string;
  private readonly bootstrapAgencyRefreshToken: string;
  private cachedAgencyToken: CachedToken | null = null;
  private readonly cachedLocationTokens = new Map<string, CachedToken>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'GHL_API_BASE_URL',
      'https://services.leadconnectorhq.com',
    );
    this.apiKey = this.configService.get<string>('GHL_API_KEY', '');
    this.locationId = this.configService.get<string>('GHL_LOCATION_ID', '');
    this.calendarId = this.configService.get<string>('GHL_CALENDAR_ID', '');
    this.oauthClientId = this.configService.get<string>('GHL_CLIENT_ID', '');
    this.oauthClientSecret = this.configService.get<string>(
      'GHL_CLIENT_SECRET',
      '',
    );
    this.oauthRedirectUri = this.configService.get<string>(
      'GHL_REDIRECT_URI',
      '',
    );
    this.oauthUserType =
      this.configService.get<'Company' | 'Location'>(
        'GHL_OAUTH_USER_TYPE',
        'Location',
      ) ?? 'Location';
    this.agencyAccessToken = this.configService.get<string>(
      'GHL_AGENCY_ACCESS_TOKEN',
      '',
    );
    this.bootstrapAgencyRefreshToken = this.configService.get<string>(
      'GHL_AGENCY_REFRESH_TOKEN',
      '',
    );
    this.agencyRefreshUserType =
      this.configService.get<'Company' | 'Location'>(
        'GHL_AGENCY_REFRESH_USER_TYPE',
        'Company',
      ) ?? 'Company';
    this.tokenRefreshLeewaySeconds =
      this.configService.get<number>('GHL_TOKEN_REFRESH_LEEWAY_SECONDS', 300) ??
      300;
    this.oauthCompanyId = this.configService.get<string>('GHL_COMPANY_ID', '');
    this.oauthLocationId = this.configService.get<string>(
      'GHL_LOCATION_ID_OAUTH',
      '',
    );
    this.locationAccessToken = this.configService.get<string>(
      'GHL_LOCATION_ACCESS_TOKEN',
      '',
    );

    const initialAgencyExp = this.extractJwtExp(this.agencyAccessToken);
    if (this.agencyAccessToken && initialAgencyExp) {
      this.cachedAgencyToken = {
        accessToken: this.agencyAccessToken,
        expiresAtUnix: initialAgencyExp,
      };
    }

    const initialLocationExp = this.extractJwtExp(this.locationAccessToken);
    if (this.locationAccessToken && initialLocationExp) {
      const initialLocationId = this.oauthLocationId || this.locationId;
      if (initialLocationId) {
        this.cachedLocationTokens.set(initialLocationId, {
          accessToken: this.locationAccessToken,
          expiresAtUnix: initialLocationExp,
        });
      }
    }
  }

  private extractJwtExp(token: string): number | null {
    if (!token) {
      return null;
    }
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return null;
      }
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(
        Buffer.from(base64, 'base64').toString('utf8'),
      ) as { exp?: number };
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
    }
  }

  private resolveLocationId(locationId?: string): string {
    const resolvedLocationId = locationId || this.oauthLocationId || this.locationId;
    if (!resolvedLocationId) {
      throw new HttpException(
        'Missing locationId. Pass it in query or set GHL_LOCATION_ID_OAUTH in environment.',
        400,
      );
    }
    return resolvedLocationId;
  }

  private isTokenStillValid(token: CachedToken): boolean {
    const now = Math.floor(Date.now() / 1000);
    return token.expiresAtUnix - now > this.tokenRefreshLeewaySeconds;
  }

  private createCachedToken(
    accessToken: string,
    expiresInSeconds: number,
  ): CachedToken {
    return {
      accessToken,
      expiresAtUnix: Math.floor(Date.now() / 1000) + expiresInSeconds,
    };
  }

  private toCachedToken(record: GhlOAuthToken): CachedToken | null {
    if (!record.accessToken || !record.accessTokenExpiresAt) {
      return null;
    }
    return {
      accessToken: record.accessToken,
      expiresAtUnix: Math.floor(record.accessTokenExpiresAt.getTime() / 1000),
    };
  }

  private async getStoredToken(
    companyId: string,
    locationId: string,
    userType: 'Company' | 'Location',
  ): Promise<GhlOAuthToken | null> {
    return this.prismaService.ghlOAuthToken.findUnique({
      where: {
        companyId_locationId_userType: {
          companyId,
          locationId,
          userType,
        },
      },
    });
  }

  private async persistTokenRecord(params: {
    companyId: string;
    locationId: string;
    userType: 'Company' | 'Location';
    accessToken?: string;
    refreshToken: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
    refreshTokenId?: string;
    userId?: string;
    isBulkInstallation?: boolean;
  }): Promise<void> {
    const accessTokenExpiresAt =
      params.accessToken && params.expiresIn && Number.isFinite(params.expiresIn)
        ? new Date(Date.now() + params.expiresIn * 1000)
        : undefined;

    await this.prismaService.ghlOAuthToken.upsert({
      where: {
        companyId_locationId_userType: {
          companyId: params.companyId,
          locationId: params.locationId,
          userType: params.userType,
        },
      },
      create: {
        companyId: params.companyId,
        locationId: params.locationId,
        userType: params.userType,
        accessToken: params.accessToken,
        accessTokenExpiresAt,
        refreshToken: params.refreshToken,
        tokenType: params.tokenType,
        scope: params.scope,
        refreshTokenId: params.refreshTokenId,
        userId: params.userId,
        isBulkInstallation: params.isBulkInstallation,
      },
      update: {
        accessToken: params.accessToken,
        accessTokenExpiresAt,
        refreshToken: params.refreshToken,
        tokenType: params.tokenType,
        scope: params.scope,
        refreshTokenId: params.refreshTokenId,
        userId: params.userId,
        isBulkInstallation: params.isBulkInstallation,
      },
    });
  }

  private async bootstrapAgencyTokenFromEnvIfNeeded(): Promise<void> {
    if (!this.oauthCompanyId || !this.bootstrapAgencyRefreshToken) {
      return;
    }
    const existing = await this.getStoredToken(
      this.oauthCompanyId,
      AGENCY_LOCATION_SCOPE,
      this.agencyRefreshUserType,
    );
    if (existing) {
      return;
    }

    const accessTokenExp = this.extractJwtExp(this.agencyAccessToken);
    await this.persistTokenRecord({
      companyId: this.oauthCompanyId,
      locationId: AGENCY_LOCATION_SCOPE,
      userType: this.agencyRefreshUserType,
      accessToken: this.agencyAccessToken || undefined,
      refreshToken: this.bootstrapAgencyRefreshToken,
      expiresIn: accessTokenExp ? accessTokenExp - Math.floor(Date.now() / 1000) : undefined,
    });
  }

  private async resolveAccessToken(
    accessTokenOverride?: string,
    locationId?: string,
  ): Promise<string> {
    if (accessTokenOverride) {
      return accessTokenOverride;
    }
    const resolvedLocationId = this.resolveLocationId(locationId);
    const locationToken = await this.getLocationAccessToken(resolvedLocationId);
    if (locationToken) {
      return locationToken;
    }
    if (this.apiKey) {
      return this.apiKey;
    }
    throw new HttpException(
      'Missing GoHighLevel token configuration. Set GHL_AGENCY_REFRESH_TOKEN (recommended) or pass accessToken in request.',
      500,
    );
  }

  private async getAgencyAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.cachedAgencyToken &&
      this.isTokenStillValid(this.cachedAgencyToken)
    ) {
      return this.cachedAgencyToken.accessToken;
    }

    await this.bootstrapAgencyTokenFromEnvIfNeeded();
    const dbToken = this.oauthCompanyId
      ? await this.getStoredToken(
          this.oauthCompanyId,
          AGENCY_LOCATION_SCOPE,
          this.agencyRefreshUserType,
        )
      : null;
    const dbCachedToken = dbToken ? this.toCachedToken(dbToken) : null;
    if (!forceRefresh && dbCachedToken && this.isTokenStillValid(dbCachedToken)) {
      this.cachedAgencyToken = dbCachedToken;
      return dbCachedToken.accessToken;
    }

    if (!forceRefresh && this.agencyAccessToken) {
      const exp = this.extractJwtExp(this.agencyAccessToken);
      if (exp && exp - Math.floor(Date.now() / 1000) > this.tokenRefreshLeewaySeconds) {
        this.cachedAgencyToken = {
          accessToken: this.agencyAccessToken,
          expiresAtUnix: exp,
        };
        return this.agencyAccessToken;
      }
    }

    const refreshToken = dbToken?.refreshToken || this.bootstrapAgencyRefreshToken;
    if (!refreshToken) {
      throw new HttpException(
        'Missing agency refresh token. Persist one token record first or set GHL_AGENCY_REFRESH_TOKEN once for bootstrap.',
        500,
      );
    }

    const refreshed = await this.refreshAccessToken({
      refreshToken,
      userType: this.agencyRefreshUserType,
    });
    const accessToken = refreshed?.access_token as string | undefined;
    const nextRefreshToken = refreshed?.refresh_token as string | undefined;
    const expiresIn = Number(refreshed?.expires_in ?? 0);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new HttpException('Invalid agency token response from GoHighLevel', 502);
    }
    if (!this.oauthCompanyId) {
      throw new HttpException(
        'Missing companyId. Set GHL_COMPANY_ID so agency token rotation can be persisted.',
        500,
      );
    }

    await this.persistTokenRecord({
      companyId: this.oauthCompanyId,
      locationId: AGENCY_LOCATION_SCOPE,
      userType: this.agencyRefreshUserType,
      accessToken,
      refreshToken: nextRefreshToken || refreshToken,
      expiresIn,
      tokenType: typeof refreshed?.token_type === 'string' ? refreshed.token_type : undefined,
      scope: typeof refreshed?.scope === 'string' ? refreshed.scope : undefined,
      refreshTokenId:
        typeof refreshed?.refreshTokenId === 'string'
          ? refreshed.refreshTokenId
          : undefined,
      userId: typeof refreshed?.userId === 'string' ? refreshed.userId : undefined,
      isBulkInstallation:
        typeof refreshed?.isBulkInstallation === 'boolean'
          ? refreshed.isBulkInstallation
          : undefined,
    });

    this.cachedAgencyToken = this.createCachedToken(accessToken, expiresIn);
    return accessToken;
  }

  private async getLocationAccessToken(locationId: string, forceRefresh = false): Promise<string> {
    const cachedLocationToken = this.cachedLocationTokens.get(locationId);
    if (!forceRefresh && cachedLocationToken && this.isTokenStillValid(cachedLocationToken)) {
      return cachedLocationToken.accessToken;
    }

    if (!forceRefresh && this.locationAccessToken && locationId === this.oauthLocationId) {
      const exp = this.extractJwtExp(this.locationAccessToken);
      if (exp && exp - Math.floor(Date.now() / 1000) > this.tokenRefreshLeewaySeconds) {
        this.cachedLocationTokens.set(locationId, {
          accessToken: this.locationAccessToken,
          expiresAtUnix: exp,
        });
        return this.locationAccessToken;
      }
    }

    const locationDbToken = this.oauthCompanyId
      ? await this.getStoredToken(this.oauthCompanyId, locationId, 'Location')
      : null;
    const locationDbCachedToken = locationDbToken
      ? this.toCachedToken(locationDbToken)
      : null;
    if (
      !forceRefresh &&
      locationDbCachedToken &&
      this.isTokenStillValid(locationDbCachedToken)
    ) {
      this.cachedLocationTokens.set(locationId, locationDbCachedToken);
      return locationDbCachedToken.accessToken;
    }

    const agencyToken = await this.getAgencyAccessToken(forceRefresh);
    const tokenResponse = await this.createLocationAccessToken({
      agencyAccessToken: agencyToken,
      companyId: this.oauthCompanyId,
      locationId,
    });

    const locationAccessToken = tokenResponse?.access_token as string | undefined;
    const expiresIn = Number(tokenResponse?.expires_in ?? 0);
    if (!locationAccessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new HttpException('Invalid location token response from GoHighLevel', 502);
    }

    const companyId =
      (tokenResponse?.companyId as string | undefined) || this.oauthCompanyId;
    const responseLocationId =
      (tokenResponse?.locationId as string | undefined) || locationId;
    const refreshedLocationToken = tokenResponse?.refresh_token as string | undefined;
    if (companyId && responseLocationId && refreshedLocationToken) {
      await this.persistTokenRecord({
        companyId,
        locationId: responseLocationId,
        userType: 'Location',
        accessToken: locationAccessToken,
        refreshToken: refreshedLocationToken,
        expiresIn,
        tokenType:
          typeof tokenResponse?.token_type === 'string'
            ? tokenResponse.token_type
            : undefined,
        scope: typeof tokenResponse?.scope === 'string' ? tokenResponse.scope : undefined,
        refreshTokenId:
          typeof tokenResponse?.refreshTokenId === 'string'
            ? tokenResponse.refreshTokenId
            : undefined,
        userId: typeof tokenResponse?.userId === 'string' ? tokenResponse.userId : undefined,
        isBulkInstallation:
          typeof tokenResponse?.isBulkInstallation === 'boolean'
            ? tokenResponse.isBulkInstallation
            : undefined,
      });
    }

    this.cachedLocationTokens.set(
      locationId,
      this.createCachedToken(locationAccessToken, expiresIn),
    );
    return locationAccessToken;
  }

  private async runWithManagedLocationToken<T>(
    accessTokenOverride: string | undefined,
    locationId: string | undefined,
    operation: (token: string) => Promise<T>,
  ): Promise<T> {
    const resolvedLocationId = locationId ? this.resolveLocationId(locationId) : undefined;
    const token = await this.resolveAccessToken(accessTokenOverride, resolvedLocationId);
    try {
      return await operation(token);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (
        !accessTokenOverride &&
        resolvedLocationId &&
        axiosError.response?.status === 401
      ) {
        const refreshedToken = await this.getLocationAccessToken(
          resolvedLocationId,
          true,
        );
        return operation(refreshedToken);
      }
      throw error;
    }
  }

  @Cron('*/5 * * * *')
  async warmUpManagedTokens(): Promise<void> {
    if (!this.oauthLocationId || !this.oauthCompanyId) {
      return;
    }

    try {
      await this.getLocationAccessToken(this.oauthLocationId);
    } catch (error) {
      const axiosError = error as AxiosError;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? (error as Error).message;
      this.logger.warn(`Failed background token warmup: ${String(details)}`);
    }
  }

  private async persistGhlAppointmentAndQueueSync(
    appointment: Record<string, unknown>,
    enqueueSync: boolean,
    sourceAction: string,
  ): Promise<void> {
    const ghlAppointmentId = String(appointment.id ?? '');
    if (!ghlAppointmentId) {
      return;
    }

    const parsedStart = appointment.startTime
      ? new Date(String(appointment.startTime))
      : null;
    const parsedEnd = appointment.endTime
      ? new Date(String(appointment.endTime))
      : null;

    const persisted = await this.prismaService.ghlAppointment.upsert({
      where: { ghlAppointmentId },
      create: {
        ghlAppointmentId,
        calendarId: String(appointment.calendarId ?? ''),
        locationId: String(appointment.locationId ?? ''),
        contactId: String(appointment.contactId ?? ''),
        assignedUserId: appointment.assignedUserId
          ? String(appointment.assignedUserId)
          : null,
        startAt:
          parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null,
        endAt: parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null,
        title: appointment.title ? String(appointment.title) : null,
        status: appointment.appointmentStatus
          ? String(appointment.appointmentStatus)
          : null,
        meetingLocationType: appointment.meetingLocationType
          ? String(appointment.meetingLocationType)
          : null,
        address: appointment.address ? String(appointment.address) : null,
        isRecurring:
          typeof appointment.isRecurring === 'boolean'
            ? appointment.isRecurring
            : null,
        rrule: appointment.rrule ? String(appointment.rrule) : null,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
      update: {
        calendarId: String(appointment.calendarId ?? ''),
        locationId: String(appointment.locationId ?? ''),
        contactId: String(appointment.contactId ?? ''),
        assignedUserId: appointment.assignedUserId
          ? String(appointment.assignedUserId)
          : null,
        startAt:
          parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null,
        endAt: parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null,
        title: appointment.title ? String(appointment.title) : null,
        status: appointment.appointmentStatus
          ? String(appointment.appointmentStatus)
          : null,
        meetingLocationType: appointment.meetingLocationType
          ? String(appointment.meetingLocationType)
          : null,
        address: appointment.address ? String(appointment.address) : null,
        isRecurring:
          typeof appointment.isRecurring === 'boolean'
            ? appointment.isRecurring
            : null,
        rrule: appointment.rrule ? String(appointment.rrule) : null,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
    });

    if (!enqueueSync) {
      return;
    }

    const idempotencyKey = `GHL_TO_LEYR:${sourceAction}:${ghlAppointmentId}`;
    await this.prismaService.appointmentSync.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        direction: 'GHL_TO_LEYR',
        status: 'pending',
        sourceSystem: `GHL:${sourceAction}`,
        sourceExternalId: ghlAppointmentId,
        targetSystem: 'LEYR',
        ghlAppointmentId: persisted.id,
      },
      update: {
        status: 'pending',
        errorMessage: null,
      },
    });
  }

  async ingestAppointmentCreateWebhook(
    payload: {
      locationId: string;
      appointment: { id: string } & Record<string, unknown>;
    },
    options: CreateGhlAppointmentOptions = {},
  ) {
    const appointment: Record<string, unknown> = {
      ...payload.appointment,
      locationId: payload.locationId || payload.appointment.locationId,
    };

    await this.persistGhlAppointmentAndQueueSync(
      appointment,
      options.enqueueSync ?? true,
      'AppointmentCreate',
    );

    return {
      accepted: true,
      appointmentId: payload.appointment.id,
      queuedSync: options.enqueueSync ?? true,
    };
  }

  async ingestAppointmentMutationWebhook(
    payload: {
      locationId: string;
      appointment: Record<string, unknown>;
    },
    mutationType: 'AppointmentUpdate' | 'AppointmentDelete',
    options: CreateGhlAppointmentOptions = {},
  ) {
    const appointment: Record<string, unknown> = {
      ...payload.appointment,
      locationId: payload.locationId || payload.appointment.locationId,
    };

    await this.persistGhlAppointmentAndQueueSync(
      appointment,
      options.enqueueSync ?? true,
      mutationType,
    );

    return {
      accepted: true,
      appointmentId: String(payload.appointment?.id ?? ''),
      queuedSync: options.enqueueSync ?? true,
    };
  }

  async refreshAccessToken(payload: RefreshGohighlevelTokenDto) {
    if (!this.oauthClientId || !this.oauthClientSecret) {
      throw new HttpException(
        'Missing GoHighLevel OAuth client credentials in environment',
        500,
      );
    }

    const formBody = new URLSearchParams({
      client_id: this.oauthClientId,
      client_secret: this.oauthClientSecret,
      grant_type: 'refresh_token',
      refresh_token: payload.refreshToken,
      user_type: payload.userType ?? this.oauthUserType,
    });

    if (this.oauthRedirectUri) {
      formBody.set('redirect_uri', this.oauthRedirectUri);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/oauth/token`, formBody, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? 'Failed to refresh GoHighLevel token';

      this.logger.error('GoHighLevel refresh token exchange failed', details);
      throw new HttpException(details, status);
    }
  }

  async storeOAuthToken(payload: StoreGohighlevelTokenDto) {
    const locationScope =
      payload.userType === 'Location'
        ? this.resolveLocationId(payload.locationId)
        : AGENCY_LOCATION_SCOPE;

    await this.persistTokenRecord({
      companyId: payload.companyId,
      locationId: locationScope,
      userType: payload.userType,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresIn: payload.expiresIn,
      tokenType: payload.tokenType,
      scope: payload.scope,
      refreshTokenId: payload.refreshTokenId,
      userId: payload.userId,
      isBulkInstallation: payload.isBulkInstallation,
    });

    if (payload.userType === this.agencyRefreshUserType && locationScope === AGENCY_LOCATION_SCOPE) {
      this.cachedAgencyToken = this.createCachedToken(
        payload.accessToken,
        payload.expiresIn,
      );
    }
    if (payload.userType === 'Location') {
      this.cachedLocationTokens.set(
        locationScope,
        this.createCachedToken(payload.accessToken, payload.expiresIn),
      );
    }

    return { stored: true };
  }

  async upsertAppointment(appointment: ExternalAppointment): Promise<void> {
    if (!this.apiKey || !this.locationId || !this.calendarId) {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: missing GoHighLevel credentials`,
      );
      return;
    }

    const payload = {
      title: appointment.title,
      calendarId: this.calendarId,
      locationId: this.locationId,
      startTime: appointment.startAt,
      endTime: appointment.endAt,
      appointmentStatus: 'confirmed',
      notes: appointment.patientName
        ? `Patient: ${appointment.patientName}`
        : undefined,
      source: 'opus-dental-layer-sync',
      externalId: appointment.id,
    };

    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/calendars/events`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Version: '2021-04-15',
        },
      }),
    );
  }

  async createLocationAccessToken(payload: CreateLocationTokenDto) {
    const token =
      payload.agencyAccessToken || (await this.getAgencyAccessToken());
    const companyId = payload.companyId || this.oauthCompanyId;
    const locationId = payload.locationId || this.oauthLocationId;

    if (!token) {
      throw new HttpException(
        'Missing agency access token. Set GHL_AGENCY_ACCESS_TOKEN or pass agencyAccessToken in request body.',
        500,
      );
    }
    if (!companyId || !locationId) {
      throw new HttpException(
        'Missing companyId/locationId. Pass them in request body or set GHL_COMPANY_ID and GHL_LOCATION_ID_OAUTH in environment.',
        400,
      );
    }

    const formBody = new URLSearchParams({
      companyId,
      locationId,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/oauth/locationToken`, formBody, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-07-28',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to generate GoHighLevel location token';

      this.logger.error('GoHighLevel location token generation failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendars(query: GetCalendarsQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);
    const showDrafted = query.showDrafted ?? true;

    const params: Record<string, string | boolean> = {
      locationId,
      showDrafted,
    };
    if (query.groupId) {
      params.groupId = query.groupId;
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? 'Failed to fetch GoHighLevel calendars';

      this.logger.error('GoHighLevel get calendars failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarGroups(query: GohighlevelLocationScopedQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/groups`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params: {
                locationId,
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel calendar groups';

      this.logger.error('GoHighLevel get groups failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarServicesCatalog(query: GetCalendarServicesQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);

    const params: Record<string, string | boolean> = {
      locationId,
    };
    if (query.serviceCategoryId) {
      params.serviceCategoryId = query.serviceCategoryId;
    }
    if (typeof query.isPrivate === 'boolean') {
      params.isPrivate = query.isPrivate;
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/services/catalog`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel services catalog';

      this.logger.error('GoHighLevel get services catalog failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarServiceLocations(query: GetCalendarServiceLocationsQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/services/locations`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params: {
                locationId,
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel service locations';

      this.logger.error('GoHighLevel get service locations failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarEvents(query: GetCalendarEventsQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);

    if (!query.startTime || !query.endTime) {
      throw new HttpException('startTime and endTime are required', 400);
    }
    if (!query.userId && !query.groupId && !query.calendarId) {
      throw new HttpException(
        'At least one of userId, groupId or calendarId is required',
        400,
      );
    }

    const params: Record<string, string> = {
      locationId,
      startTime: query.startTime,
      endTime: query.endTime,
    };
    if (query.userId) params.userId = query.userId;
    if (query.groupId) params.groupId = query.groupId;
    if (query.calendarId) params.calendarId = query.calendarId;

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/events`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? 'Failed to fetch GoHighLevel events';

      this.logger.error('GoHighLevel get calendar events failed', details);
      throw new HttpException(details, status);
    }
  }

  async getAppointmentById(
    eventId: string,
    query: GohighlevelAccessTokenQueryDto,
  ) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(
              `${this.baseUrl}/calendars/events/appointments/${eventId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-04-15',
                },
              },
            ),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel appointment';

      this.logger.error('GoHighLevel get appointment failed', details);
      throw new HttpException(details, status);
    }
  }

  async getBlockedSlots(query: GetCalendarEventsQueryDto) {
    const locationId = this.resolveLocationId(query.locationId);

    if (!query.startTime || !query.endTime) {
      throw new HttpException('startTime and endTime are required', 400);
    }
    if (!query.userId && !query.groupId && !query.calendarId) {
      throw new HttpException(
        'At least one of userId, groupId or calendarId is required',
        400,
      );
    }

    const params: Record<string, string> = {
      locationId,
      startTime: query.startTime,
      endTime: query.endTime,
    };
    if (query.userId) params.userId = query.userId;
    if (query.groupId) params.groupId = query.groupId;
    if (query.calendarId) params.calendarId = query.calendarId;

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/blocked-slots`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel blocked slots';

      this.logger.error('GoHighLevel get blocked slots failed', details);
      throw new HttpException(details, status);
    }
  }

  async createContact(payload: CreateContactDto) {
    const locationId = this.resolveLocationId(payload.locationId);

    const requestPayload = {
      ...payload,
      locationId,
    };
    delete (requestPayload as { accessToken?: string }).accessToken;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.post(`${this.baseUrl}/contacts/`, requestPayload, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-07-28',
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to create GoHighLevel contact';

      this.logger.error('GoHighLevel create contact failed', details);
      throw new HttpException(details, status);
    }
  }

  async getContact(contactId: string, query: GetContactQueryDto) {
    if (!contactId) {
      throw new HttpException('Missing contactId', 400);
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/contacts/${contactId}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-07-28',
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel contact';

      this.logger.error('GoHighLevel get contact failed', details);
      throw new HttpException(details, status);
    }
  }

  async deleteContact(contactId: string, query: DeleteContactQueryDto) {
    if (!contactId) {
      throw new HttpException('Missing contactId', 400);
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.delete(`${this.baseUrl}/contacts/${contactId}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-07-28',
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to delete GoHighLevel contact';

      this.logger.error('GoHighLevel delete contact failed', details);
      throw new HttpException(details, status);
    }
  }

  async searchContacts(payload: SearchContactsDto) {
    const locationId = this.resolveLocationId(payload.locationId);

    const requestPayload: Record<string, unknown> = {
      locationId,
      pageLimit: payload.pageLimit ?? 20,
    };
    if (payload.page != null) requestPayload.page = payload.page;
    if (payload.searchAfter) requestPayload.searchAfter = payload.searchAfter;
    if (payload.filters) requestPayload.filters = payload.filters;
    if (payload.sort) requestPayload.sort = payload.sort;
    if (payload.query) requestPayload.query = payload.query;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.post(
              `${this.baseUrl}/contacts/search`,
              requestPayload,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-07-28',
                },
              },
            ),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to search GoHighLevel contacts';

      this.logger.error('GoHighLevel search contacts failed', details);
      throw new HttpException(details, status);
    }
  }

  async searchContactByName(payload: SearchContactsByNameDto) {
    const locationId = this.resolveLocationId(payload.locationId);

    const searchPayload: SearchContactsDto = {
      accessToken: payload.accessToken,
      locationId,
      pageLimit: 1,
      page: 1,
      filters: [
        {
          group: 'AND',
          filters: [
            {
              field: 'firstNameLowerCase',
              operator: 'eq',
              value: payload.firstName.toLowerCase(),
            },
            {
              field: 'lastNameLowerCase',
              operator: 'eq',
              value: payload.lastName.toLowerCase(),
            },
          ],
        },
      ],
    };

    const result = await this.searchContacts(searchPayload);
    const contacts = (result as { contacts?: unknown[] })?.contacts ?? [];
    return {
      found: contacts.length > 0,
      contact: contacts[0] ?? null,
    };
  }

  async createAppointment(
    payload: CreateAppointmentDto,
    options: CreateGhlAppointmentOptions = {},
  ) {
    const locationId = this.resolveLocationId(payload.locationId);
    const calendarId = payload.calendarId || this.calendarId;

    if (!calendarId) {
      throw new HttpException(
        'Missing calendarId. Pass it in request body or set GHL_CALENDAR_ID in environment.',
        400,
      );
    }
    if (!payload.contactId || !payload.startTime) {
      throw new HttpException('contactId and startTime are required', 400);
    }

    const requestPayload = {
      ...payload,
      calendarId,
      locationId,
    };
    delete (requestPayload as { accessToken?: string }).accessToken;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.post(
              `${this.baseUrl}/calendars/events/appointments`,
              requestPayload,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-04-15',
                },
              },
            ),
          ),
      );
      await this.persistGhlAppointmentAndQueueSync(
        response.data as Record<string, unknown>,
        options.enqueueSync ?? true,
        'AppointmentCreate',
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to create GoHighLevel appointment';

      this.logger.error('GoHighLevel create appointment failed', details);
      throw new HttpException(details, status);
    }
  }

  async updateAppointment(eventId: string, payload: UpdateAppointmentDto) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    const requestPayload = {
      ...payload,
    };
    delete (requestPayload as { accessToken?: string }).accessToken;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.put(
              `${this.baseUrl}/calendars/events/appointments/${eventId}`,
              requestPayload,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-04-15',
                },
              },
            ),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to update GoHighLevel appointment';

      this.logger.error('GoHighLevel update appointment failed', details);
      throw new HttpException(details, status);
    }
  }

  async deleteEvent(eventId: string, payload: DeleteEventDto) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }
    const requestPayload = {
      ...payload,
    };
    delete (requestPayload as { accessToken?: string }).accessToken;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.delete(`${this.baseUrl}/calendars/events/${eventId}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              data: requestPayload,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? 'Failed to delete GoHighLevel event';

      this.logger.error('GoHighLevel delete event failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarById(
    calendarId: string,
    query: GohighlevelAccessTokenQueryDto,
  ) {
    if (!calendarId) {
      throw new HttpException('Missing calendarId', 400);
    }

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/${calendarId}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ?? 'Failed to fetch GoHighLevel calendar';

      this.logger.error('GoHighLevel get calendar by id failed', details);
      throw new HttpException(details, status);
    }
  }

  async createBlockSlot(payload: CreateBlockSlotDto) {
    const locationId = this.resolveLocationId(payload.locationId);

    if (!payload.calendarId && !payload.assignedUserId) {
      throw new HttpException(
        'Either calendarId or assignedUserId is required',
        400,
      );
    }
    if (payload.calendarId && payload.assignedUserId) {
      throw new HttpException(
        'Only one of calendarId or assignedUserId can be set, not both',
        400,
      );
    }
    if (!payload.startTime) {
      throw new HttpException('startTime is required', 400);
    }

    const requestPayload: Record<string, unknown> = {
      locationId,
      startTime: payload.startTime,
    };
    if (payload.title) requestPayload.title = payload.title;
    if (payload.calendarId) requestPayload.calendarId = payload.calendarId;
    if (payload.assignedUserId) requestPayload.assignedUserId = payload.assignedUserId;
    if (payload.endTime) requestPayload.endTime = payload.endTime;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.post(
              `${this.baseUrl}/calendars/events/block-slots`,
              requestPayload,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-04-15',
                },
              },
            ),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to create GoHighLevel block slot';

      this.logger.error('GoHighLevel create block slot failed', details);
      throw new HttpException(details, status);
    }
  }

  async updateBlockSlot(eventId: string, payload: UpdateBlockSlotDto) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    const locationId = this.resolveLocationId(payload.locationId);

    if (payload.calendarId && payload.assignedUserId) {
      throw new HttpException(
        'Only one of calendarId or assignedUserId can be set, not both',
        400,
      );
    }

    const requestPayload: Record<string, unknown> = {
      locationId,
    };
    if (payload.title !== undefined) requestPayload.title = payload.title;
    if (payload.calendarId) requestPayload.calendarId = payload.calendarId;
    if (payload.assignedUserId) requestPayload.assignedUserId = payload.assignedUserId;
    if (payload.startTime) requestPayload.startTime = payload.startTime;
    if (payload.endTime) requestPayload.endTime = payload.endTime;

    try {
      const response = await this.runWithManagedLocationToken(
        payload.accessToken,
        locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.put(
              `${this.baseUrl}/calendars/events/block-slots/${eventId}`,
              requestPayload,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Version: '2021-04-15',
                },
              },
            ),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to update GoHighLevel block slot';

      this.logger.error('GoHighLevel update block slot failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarFreeSlots(
    calendarId: string,
    query: GetCalendarFreeSlotsQueryDto,
  ) {
    if (!calendarId) {
      throw new HttpException('Missing calendarId', 400);
    }
    if (!Number.isFinite(query.startDate) || !Number.isFinite(query.endDate)) {
      throw new HttpException('startDate and endDate are required numbers', 400);
    }
    if (query.endDate < query.startDate) {
      throw new HttpException('endDate must be greater than startDate', 400);
    }

    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    if (query.endDate - query.startDate > THIRTY_ONE_DAYS_MS) {
      throw new HttpException(
        'Date range cannot be more than 31 days',
        400,
      );
    }

    const params: Record<string, string | number | string[]> = {
      startDate: query.startDate,
      endDate: query.endDate,
    };
    if (query.timezone) params.timezone = query.timezone;
    if (query.userId) params.userId = query.userId;
    if (query.userIds?.length) params.userIds = query.userIds;

    try {
      const response = await this.runWithManagedLocationToken(
        query.accessToken,
        this.oauthLocationId || this.locationId,
        async (token) =>
          firstValueFrom(
            this.httpService.get(`${this.baseUrl}/calendars/${calendarId}/free-slots`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-04-15',
              },
              params,
            }),
          ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 502;
      const details =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : axiosError.response?.data ??
            'Failed to fetch GoHighLevel calendar free slots';

      this.logger.error('GoHighLevel get calendar free slots failed', details);
      throw new HttpException(details, status);
    }
  }
}
