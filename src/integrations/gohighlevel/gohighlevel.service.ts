import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { RefreshGohighlevelTokenDto } from './dto/refresh-token.dto';
import { CreateLocationTokenDto } from './dto/location-token.dto';
import {
  CreateAppointmentDto,
  GetCalendarEventsQueryDto,
  GetCalendarFreeSlotsQueryDto,
  GetCalendarServiceLocationsQueryDto,
  GetCalendarServicesQueryDto,
  GetCalendarsQueryDto,
  GohighlevelAccessTokenQueryDto,
  GohighlevelLocationScopedQueryDto,
} from './dto/calendars.dto';

export interface ExternalAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  patientName?: string;
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
  private readonly oauthCompanyId: string;
  private readonly oauthLocationId: string;
  private readonly locationAccessToken: string;

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
    this.oauthCompanyId = this.configService.get<string>('GHL_COMPANY_ID', '');
    this.oauthLocationId = this.configService.get<string>(
      'GHL_LOCATION_ID_OAUTH',
      '',
    );
    this.locationAccessToken = this.configService.get<string>(
      'GHL_LOCATION_ACCESS_TOKEN',
      '',
    );
  }

  private resolveAccessToken(accessToken?: string): string {
    const token = accessToken || this.locationAccessToken || this.apiKey;
    if (!token) {
      throw new HttpException(
        'Missing location access token. Set GHL_LOCATION_ACCESS_TOKEN or pass accessToken in request query.',
        500,
      );
    }
    return token;
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
    const token = payload.agencyAccessToken || this.agencyAccessToken;
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
    const token = this.resolveAccessToken(query.accessToken);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params,
        }),
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
    const token = this.resolveAccessToken(query.accessToken);
    const locationId = this.resolveLocationId(query.locationId);

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/groups`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params: {
            locationId,
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
            'Failed to fetch GoHighLevel calendar groups';

      this.logger.error('GoHighLevel get groups failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarServicesCatalog(query: GetCalendarServicesQueryDto) {
    const token = this.resolveAccessToken(query.accessToken);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/services/catalog`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params,
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
            'Failed to fetch GoHighLevel services catalog';

      this.logger.error('GoHighLevel get services catalog failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarServiceLocations(query: GetCalendarServiceLocationsQueryDto) {
    const token = this.resolveAccessToken(query.accessToken);
    const locationId = this.resolveLocationId(query.locationId);

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/services/locations`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params: {
            locationId,
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
            'Failed to fetch GoHighLevel service locations';

      this.logger.error('GoHighLevel get service locations failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarEvents(query: GetCalendarEventsQueryDto) {
    const token = this.resolveAccessToken(query.accessToken);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/events`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params,
        }),
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
    const token = this.resolveAccessToken(query.accessToken);
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/calendars/events/appointments/${eventId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Version: '2021-04-15',
            },
          },
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
    const token = this.resolveAccessToken(query.accessToken);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/blocked-slots`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params,
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
            'Failed to fetch GoHighLevel blocked slots';

      this.logger.error('GoHighLevel get blocked slots failed', details);
      throw new HttpException(details, status);
    }
  }

  async createAppointment(payload: CreateAppointmentDto) {
    const token = this.resolveAccessToken(payload.accessToken);
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
      const response = await firstValueFrom(
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

  async getCalendarById(
    calendarId: string,
    query: GohighlevelAccessTokenQueryDto,
  ) {
    const token = this.resolveAccessToken(query.accessToken);
    if (!calendarId) {
      throw new HttpException('Missing calendarId', 400);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/${calendarId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
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
          : axiosError.response?.data ?? 'Failed to fetch GoHighLevel calendar';

      this.logger.error('GoHighLevel get calendar by id failed', details);
      throw new HttpException(details, status);
    }
  }

  async getCalendarFreeSlots(
    calendarId: string,
    query: GetCalendarFreeSlotsQueryDto,
  ) {
    const token = this.resolveAccessToken(query.accessToken);
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
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/calendars/${calendarId}/free-slots`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
          params,
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
            'Failed to fetch GoHighLevel calendar free slots';

      this.logger.error('GoHighLevel get calendar free slots failed', details);
      throw new HttpException(details, status);
    }
  }
}
