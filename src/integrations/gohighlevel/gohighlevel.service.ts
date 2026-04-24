import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { RefreshGohighlevelTokenDto } from './dto/refresh-token.dto';
import { CreateLocationTokenDto } from './dto/location-token.dto';
import {
  CreateAppointmentDto,
  DeleteEventDto,
  GetCalendarEventsQueryDto,
  GetCalendarFreeSlotsQueryDto,
  GetCalendarServiceLocationsQueryDto,
  GetCalendarServicesQueryDto,
  GetCalendarsQueryDto,
  GohighlevelAccessTokenQueryDto,
  GohighlevelLocationScopedQueryDto,
  UpdateAppointmentDto,
} from './dto/calendars.dto';

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
  private readonly agencyRefreshToken: string;
  private readonly agencyRefreshUserType: 'Company' | 'Location';
  private readonly tokenRefreshLeewaySeconds: number;
  private readonly oauthCompanyId: string;
  private readonly oauthLocationId: string;
  private readonly locationAccessToken: string;
  private currentAgencyRefreshToken: string;
  private cachedAgencyToken: CachedToken | null = null;
  private readonly cachedLocationTokens = new Map<string, CachedToken>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
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
    this.agencyRefreshToken = this.configService.get<string>(
      'GHL_AGENCY_REFRESH_TOKEN',
      '',
    );
    this.currentAgencyRefreshToken = this.agencyRefreshToken;
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
    if (!forceRefresh && this.cachedAgencyToken && this.isTokenStillValid(this.cachedAgencyToken)) {
      return this.cachedAgencyToken.accessToken;
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

    if (!this.currentAgencyRefreshToken) {
      throw new HttpException(
        'Missing agency refresh token. Set GHL_AGENCY_REFRESH_TOKEN for automatic token management.',
        500,
      );
    }

    const refreshed = await this.refreshAccessToken({
      refreshToken: this.currentAgencyRefreshToken,
      userType: this.agencyRefreshUserType,
    });
    const accessToken = refreshed?.access_token as string | undefined;
    const nextRefreshToken = refreshed?.refresh_token as string | undefined;
    const expiresIn = Number(refreshed?.expires_in ?? 0);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new HttpException('Invalid agency token response from GoHighLevel', 502);
    }
    if (nextRefreshToken) {
      if (nextRefreshToken !== this.currentAgencyRefreshToken) {
        this.logger.warn(
          'GoHighLevel returned a rotated refresh token. Persist the new value to durable storage for restart safety.',
        );
      }
      this.currentAgencyRefreshToken = nextRefreshToken;
    }

    this.cachedAgencyToken = {
      accessToken,
      expiresAtUnix: Math.floor(Date.now() / 1000) + expiresIn,
    };
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

    this.cachedLocationTokens.set(locationId, {
      accessToken: locationAccessToken,
      expiresAtUnix: Math.floor(Date.now() / 1000) + expiresIn,
    });
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
    if (!this.agencyRefreshToken || !this.oauthLocationId || !this.oauthCompanyId) {
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

  async createAppointment(payload: CreateAppointmentDto) {
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
