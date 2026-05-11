import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RefreshGohighlevelTokenDto } from './dto/refresh-token.dto';
import { StoreGohighlevelTokenDto } from './dto/store-token.dto';
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
import {
  CreateContactDto,
  DeleteContactQueryDto,
  GetContactQueryDto,
} from './dto/contacts.dto';

export interface ExternalAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  patientName?: string;
}

interface CreateGhlAppointmentOptions {
  enqueueSync?: boolean;
}

const MOCK_LOCATION_ID = 'mock-loc-stockholm-01';
const MOCK_CALENDAR_ID = 'mock-cal-dental-01';
const MOCK_COMPANY_ID = 'mock-company-01';

const MOCK_CALENDARS = [
  {
    id: MOCK_CALENDAR_ID,
    locationId: MOCK_LOCATION_ID,
    name: 'Dental Appointments - Stockholm',
    description: 'Main calendar for Stockholm dental clinic',
    slug: 'dental-stockholm',
    isActive: true,
    calendarType: 'round_robin',
    widgetSlug: 'dental-stockholm',
    widgetType: 'default',
    teamMembers: [
      { userId: 'mock-user-001', name: 'Dr. Sofia Andersson', priority: 1 },
      { userId: 'mock-user-002', name: 'Dr. Magnus Ekström', priority: 2 },
    ],
  },
  {
    id: 'mock-cal-dental-02',
    locationId: MOCK_LOCATION_ID,
    name: 'Dental Appointments - Oslo',
    description: 'Main calendar for Oslo dental clinic',
    slug: 'dental-oslo',
    isActive: true,
    calendarType: 'round_robin',
    widgetSlug: 'dental-oslo',
    widgetType: 'default',
    teamMembers: [
      { userId: 'mock-user-003', name: 'Dr. Karin Olsen', priority: 1 },
    ],
  },
];

const MOCK_SERVICES = [
  {
    id: 'mock-svc-001',
    name: 'Dental Examination',
    description: 'Comprehensive dental checkup',
    duration: 30,
    price: 850,
    currency: 'SEK',
    isPrivate: false,
    locationId: MOCK_LOCATION_ID,
  },
  {
    id: 'mock-svc-002',
    name: 'Dental Cleaning',
    description: 'Professional teeth cleaning',
    duration: 45,
    price: 1200,
    currency: 'SEK',
    isPrivate: false,
    locationId: MOCK_LOCATION_ID,
  },
  {
    id: 'mock-svc-003',
    name: 'Emergency Dental Visit',
    description: 'Urgent dental care',
    duration: 60,
    price: 2000,
    currency: 'SEK',
    isPrivate: true,
    locationId: MOCK_LOCATION_ID,
  },
];

const MOCK_SERVICE_LOCATIONS = [
  {
    id: 'mock-svcloc-001',
    name: 'Stockholm Clinic',
    address: 'Sveavägen 42, Stockholm',
    locationId: MOCK_LOCATION_ID,
  },
  {
    id: 'mock-svcloc-002',
    name: 'Oslo Clinic',
    address: 'Karl Johans gate 15, Oslo',
    locationId: MOCK_LOCATION_ID,
  },
];

const MOCK_GROUPS = [
  {
    id: 'mock-grp-001',
    locationId: MOCK_LOCATION_ID,
    name: 'Dental Team Stockholm',
    description: 'All dentists at Stockholm location',
    slug: 'dental-team-stockholm',
    isActive: true,
  },
];

const inMemoryGhlAppointments: Array<Record<string, unknown>> = [];
const inMemoryGhlContacts: Array<Record<string, unknown>> = [];

function generateFreeSlots(
  startDate: number,
  endDate: number,
  timezone?: string,
): Record<string, { slots: string[] }> {
  const tz = timezone ?? 'Europe/Stockholm';
  const result: Record<string, { slots: string[] }> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) {
      const dateKey = current.toISOString().split('T')[0];
      const slots: string[] = [];
      for (let hour = 8; hour < 16; hour++) {
        const slotDate = new Date(current);
        slotDate.setHours(hour, 0, 0, 0);
        slots.push(
          slotDate.toLocaleString('sv-SE', { timeZone: tz }) + ` (${tz})`,
        );
      }
      result[dateKey] = { slots };
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function makeMockJwt(expiresIn: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'mock-user',
      exp: Math.floor(Date.now() / 1000) + expiresIn,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString('base64url');
  const sig = Buffer.from('mock-signature').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

@Injectable()
export class GohighlevelMockService {
  private readonly logger = new Logger(GohighlevelMockService.name);

  constructor(private readonly prismaService: PrismaService) {
    this.logger.log(
      'Using MOCK GoHighLevel service (USE_MOCK_INTEGRATIONS=true)',
    );
  }

  private async persistGhlAppointmentAndQueueSync(
    appointment: Record<string, unknown>,
    enqueueSync: boolean,
    sourceAction: string,
  ): Promise<void> {
    const ghlAppointmentId = String(appointment.id ?? '');
    if (!ghlAppointmentId) return;

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
          parsedStart && !Number.isNaN(parsedStart.getTime())
            ? parsedStart
            : null,
        endAt:
          parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null,
        title: appointment.title ? String(appointment.title) : null,
        status: appointment.appointmentStatus
          ? String(appointment.appointmentStatus)
          : null,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
      update: {
        calendarId: String(appointment.calendarId ?? ''),
        locationId: String(appointment.locationId ?? ''),
        contactId: String(appointment.contactId ?? ''),
        startAt:
          parsedStart && !Number.isNaN(parsedStart.getTime())
            ? parsedStart
            : null,
        endAt:
          parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null,
        title: appointment.title ? String(appointment.title) : null,
        status: appointment.appointmentStatus
          ? String(appointment.appointmentStatus)
          : null,
        rawPayload: appointment as Prisma.InputJsonValue,
      },
    });

    if (!enqueueSync) return;

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

  async refreshAccessToken(_payload: RefreshGohighlevelTokenDto) {
    const accessToken = makeMockJwt(86400);
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86399,
      refresh_token: `mock-refresh-${randomUUID().slice(0, 12)}`,
      scope: 'calendars.readonly calendars.write contacts.readonly contacts.write',
      userType: 'Location',
      locationId: MOCK_LOCATION_ID,
      companyId: MOCK_COMPANY_ID,
      userId: 'mock-user-001',
    };
  }

  async storeOAuthToken(payload: StoreGohighlevelTokenDto) {
    const locationScope =
      payload.userType === 'Location'
        ? (payload.locationId ?? MOCK_LOCATION_ID)
        : '__agency__';

    await this.prismaService.ghlOAuthToken.upsert({
      where: {
        companyId_locationId_userType: {
          companyId: payload.companyId,
          locationId: locationScope,
          userType: payload.userType,
        },
      },
      create: {
        companyId: payload.companyId,
        locationId: locationScope,
        userType: payload.userType,
        accessToken: payload.accessToken,
        accessTokenExpiresAt: new Date(Date.now() + payload.expiresIn * 1000),
        refreshToken: payload.refreshToken,
        tokenType: payload.tokenType,
        scope: payload.scope,
      },
      update: {
        accessToken: payload.accessToken,
        accessTokenExpiresAt: new Date(Date.now() + payload.expiresIn * 1000),
        refreshToken: payload.refreshToken,
      },
    });

    return { stored: true };
  }

  async upsertAppointment(appointment: ExternalAppointment): Promise<void> {
    this.logger.log(`Mock upsert appointment: ${appointment.id}`);
    const ghlId = `ghl-mock-${randomUUID().slice(0, 12)}`;

    const apptRecord: Record<string, unknown> = {
      id: ghlId,
      calendarId: MOCK_CALENDAR_ID,
      locationId: MOCK_LOCATION_ID,
      contactId: 'mock-contact-001',
      startTime: appointment.startAt,
      endTime: appointment.endAt,
      title: appointment.title,
      appointmentStatus: 'confirmed',
    };

    inMemoryGhlAppointments.push(apptRecord);
  }

  async createLocationAccessToken(_payload: CreateLocationTokenDto) {
    const accessToken = makeMockJwt(86400);
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86399,
      scope: 'calendars.readonly calendars.write',
      locationId: MOCK_LOCATION_ID,
      userId: 'mock-user-001',
    };
  }

  async getCalendars(_query: GetCalendarsQueryDto) {
    return { calendars: MOCK_CALENDARS };
  }

  async getCalendarGroups(_query: GohighlevelLocationScopedQueryDto) {
    return { groups: MOCK_GROUPS };
  }

  async getCalendarServicesCatalog(query: GetCalendarServicesQueryDto) {
    let services = [...MOCK_SERVICES];
    if (typeof query.isPrivate === 'boolean') {
      services = services.filter((s) => s.isPrivate === query.isPrivate);
    }
    return { services };
  }

  async getCalendarServiceLocations(
    _query: GetCalendarServiceLocationsQueryDto,
  ) {
    return { serviceLocations: MOCK_SERVICE_LOCATIONS };
  }

  async getCalendarEvents(query: GetCalendarEventsQueryDto) {
    if (!query.startTime || !query.endTime) {
      throw new HttpException('startTime and endTime are required', 400);
    }
    if (!query.userId && !query.groupId && !query.calendarId) {
      throw new HttpException(
        'At least one of userId, groupId or calendarId is required',
        400,
      );
    }

    const events = inMemoryGhlAppointments.filter((a) => {
      if (query.calendarId && a.calendarId !== query.calendarId) return false;
      return true;
    });

    return { events };
  }

  async getAppointmentById(
    eventId: string,
    _query: GohighlevelAccessTokenQueryDto,
  ) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }
    const appointment = inMemoryGhlAppointments.find((a) => a.id === eventId);
    return { event: appointment ?? null };
  }

  async getBlockedSlots(query: GetCalendarEventsQueryDto) {
    if (!query.startTime || !query.endTime) {
      throw new HttpException('startTime and endTime are required', 400);
    }
    return { events: [] };
  }

  async createContact(payload: CreateContactDto) {
    const locationId = payload.locationId || MOCK_LOCATION_ID;
    const id = `ghl-contact-mock-${randomUUID().slice(0, 12)}`;

    const contact: Record<string, unknown> = {
      id,
      locationId,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      name: payload.name ?? ([payload.firstName, payload.lastName].filter(Boolean).join(' ') || null),
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      gender: payload.gender ?? null,
      address1: payload.address1 ?? null,
      city: payload.city ?? null,
      state: payload.state ?? null,
      postalCode: payload.postalCode ?? null,
      website: payload.website ?? null,
      timezone: payload.timezone ?? null,
      dnd: payload.dnd ?? false,
      tags: payload.tags ?? [],
      source: payload.source ?? 'public api',
      dateOfBirth: payload.dateOfBirth ?? null,
      country: payload.country ?? null,
      companyName: payload.companyName ?? null,
      assignedTo: payload.assignedTo ?? null,
      dateAdded: new Date().toISOString(),
    };

    inMemoryGhlContacts.push(contact);
    return { contact };
  }

  async getContact(contactId: string, _query: GetContactQueryDto) {
    if (!contactId) {
      throw new HttpException('Missing contactId', 400);
    }
    const contact = inMemoryGhlContacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new HttpException('Contact not found', 404);
    }
    return { contact };
  }

  async deleteContact(contactId: string, _query: DeleteContactQueryDto) {
    if (!contactId) {
      throw new HttpException('Missing contactId', 400);
    }
    const idx = inMemoryGhlContacts.findIndex((c) => c.id === contactId);
    if (idx !== -1) {
      inMemoryGhlContacts.splice(idx, 1);
    }
    return { succeded: true, message: 'Deleted successfully' };
  }

  async createAppointment(
    payload: CreateAppointmentDto,
    options: CreateGhlAppointmentOptions = {},
  ) {
    const calendarId = payload.calendarId || MOCK_CALENDAR_ID;
    const locationId = payload.locationId || MOCK_LOCATION_ID;

    if (!payload.contactId || !payload.startTime) {
      throw new HttpException('contactId and startTime are required', 400);
    }

    const id = `ghl-mock-${randomUUID().slice(0, 12)}`;
    const appointment: Record<string, unknown> = {
      id,
      calendarId,
      locationId,
      contactId: payload.contactId,
      assignedUserId: payload.assignedUserId ?? null,
      startTime: payload.startTime,
      endTime:
        payload.endTime ??
        new Date(
          new Date(payload.startTime).getTime() + 60 * 60 * 1000,
        ).toISOString(),
      title: payload.title ?? 'Dental Appointment',
      appointmentStatus: payload.appointmentStatus ?? 'confirmed',
      meetingLocationType: payload.meetingLocationType ?? 'custom',
      address: payload.address ?? null,
    };

    inMemoryGhlAppointments.push(appointment);

    await this.persistGhlAppointmentAndQueueSync(
      appointment,
      options.enqueueSync ?? true,
      'AppointmentCreate',
    );

    return appointment;
  }

  async updateAppointment(eventId: string, payload: UpdateAppointmentDto) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    const idx = inMemoryGhlAppointments.findIndex((a) => a.id === eventId);
    if (idx === -1) {
      throw new HttpException('Appointment not found', 404);
    }

    const updated = { ...inMemoryGhlAppointments[idx], ...payload };
    inMemoryGhlAppointments[idx] = updated;

    return updated;
  }

  async deleteEvent(eventId: string, _payload: DeleteEventDto) {
    if (!eventId) {
      throw new HttpException('Missing eventId', 400);
    }

    const idx = inMemoryGhlAppointments.findIndex((a) => a.id === eventId);
    if (idx !== -1) {
      inMemoryGhlAppointments.splice(idx, 1);
    }

    return { succeeded: true };
  }

  async getCalendarById(
    calendarId: string,
    _query: GohighlevelAccessTokenQueryDto,
  ) {
    if (!calendarId) {
      throw new HttpException('Missing calendarId', 400);
    }
    const cal = MOCK_CALENDARS.find((c) => c.id === calendarId);
    return { calendar: cal ?? null };
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
      throw new HttpException('Date range cannot be more than 31 days', 400);
    }

    return generateFreeSlots(query.startDate, query.endDate, query.timezone);
  }

  async warmUpManagedTokens(): Promise<void> {
    this.logger.debug('Mock token warmup (no-op)');
  }
}
