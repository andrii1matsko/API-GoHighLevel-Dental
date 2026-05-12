import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { GohighlevelService } from './gohighlevel.service';
import { RefreshGohighlevelTokenDto } from './dto/refresh-token.dto';
import { GohighlevelTokenResponseDto } from './dto/token-response.dto';
import { StoreGohighlevelTokenDto } from './dto/store-token.dto';
import {
  CreateLocationTokenDto,
  GohighlevelLocationTokenResponseDto,
} from './dto/location-token.dto';
import {
  CreateAppointmentDto,
  DeleteEventDto,
  GetCalendarFreeSlotsQueryDto,
  GetCalendarEventsQueryDto,
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
  SearchContactsByNameDto,
  SearchContactsDto,
} from './dto/contacts.dto';
import { GhlAppointmentCreateWebhookDto } from './dto/webhook-appointment-create.dto';
import { GhlAppointmentMutationWebhookDto } from './dto/webhook-appointment-mutation.dto';

@ApiTags('GoHighLevel')
@Controller('gohighlevel')
export class GohighlevelController {
  constructor(private readonly gohighlevelService: GohighlevelService) {}

  @Post('oauth/token/refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange refresh token for a new GoHighLevel access token',
  })
  @ApiOkResponse({ type: GohighlevelTokenResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid refresh token request payload' })
  @ApiUnauthorizedResponse({ description: 'Invalid client credentials or token' })
  @ApiUnprocessableEntityResponse({
    description: 'Upstream request validated but cannot be processed',
  })
  refreshToken(@Body() body: RefreshGohighlevelTokenDto) {
    return this.gohighlevelService.refreshAccessToken(body);
  }

  @Post('oauth/token/store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Persist GoHighLevel OAuth tokens for automatic rotation',
  })
  @ApiOkResponse({
    schema: {
      example: {
        stored: true,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid token payload' })
  storeToken(@Body() body: StoreGohighlevelTokenDto) {
    return this.gohighlevelService.storeOAuthToken(body);
  }

  @Post('oauth/location-token')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate location access token from agency access token',
  })
  @ApiOkResponse({ type: GohighlevelLocationTokenResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid payload or missing required identifiers',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired agency access token',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Upstream request validated but cannot be processed',
  })
  createLocationToken(@Body() body: CreateLocationTokenDto) {
    return this.gohighlevelService.createLocationAccessToken(body);
  }

  @Post('contacts')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiBadRequestResponse({ description: 'Missing locationId or invalid payload' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  createContact(@Body() body: CreateContactDto) {
    return this.gohighlevelService.createContact(body);
  }

  @Post('contacts/search')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Search contacts with advanced filters',
    description:
      'Search contacts based on combinations of advanced filters, sorting, and pagination.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        contacts: [],
        total: 0,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing locationId or invalid filters' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  searchContacts(@Body() body: SearchContactsDto) {
    return this.gohighlevelService.searchContacts(body);
  }

  @Post('contacts/search/by-name')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Find a contact by first and last name',
    description:
      'Convenience endpoint that searches for a contact matching exact first + last name. Returns { found: boolean, contact: object | null }.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        found: true,
        contact: {
          id: 'abc123',
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing firstName or lastName' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  searchContactByName(@Body() body: SearchContactsByNameDto) {
    return this.gohighlevelService.searchContactByName(body);
  }

  @Get('contacts/:contactId')
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiBadRequestResponse({ description: 'Missing contactId' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getContact(
    @Param('contactId') contactId: string,
    @Query() query: GetContactQueryDto,
  ) {
    return this.gohighlevelService.getContact(contactId, query);
  }

  @Delete('contacts/:contactId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete contact by ID' })
  @ApiBadRequestResponse({ description: 'Missing contactId' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  deleteContact(
    @Param('contactId') contactId: string,
    @Query() query: DeleteContactQueryDto,
  ) {
    return this.gohighlevelService.deleteContact(contactId, query);
  }

  @Get('calendars')
  @ApiOperation({ summary: 'Get all calendars in a location' })
  @ApiOkResponse({
    schema: {
      example: {
        calendars: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing locationId or invalid query parameters',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getCalendars(@Query() query: GetCalendarsQueryDto) {
    return this.gohighlevelService.getCalendars(query);
  }

  @Get('calendars/:calendarId/free-slots')
  @ApiOperation({
    summary: 'Get free slots for a calendar in a date range',
  })
  @ApiOkResponse({
    schema: {
      example: {
        '2024-10-28': {
          slots: ['2024-10-28T10:00:00-05:00', '2024-10-28T11:00:00-05:00'],
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid startDate/endDate or range exceeds 31 days, or missing calendarId',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getCalendarFreeSlots(
    @Param('calendarId') calendarId: string,
    @Query() query: GetCalendarFreeSlotsQueryDto,
  ) {
    return this.gohighlevelService.getCalendarFreeSlots(calendarId, query);
  }

  @Get('calendars/groups')
  @ApiOperation({ summary: 'Get all calendar groups in a location' })
  @ApiOkResponse({
    schema: {
      example: {
        groups: [
          {
            locationId: 'ocQHyuzHvysMo5N5VsXc',
            name: 'group a',
            description: 'group description',
            slug: '15-mins',
            isActive: true,
            id: 'ocQHyuzHvysMo5N5VsXc',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing locationId' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getGroups(@Query() query: GohighlevelLocationScopedQueryDto) {
    return this.gohighlevelService.getCalendarGroups(query);
  }

  @Get('calendars/services/catalog')
  @ApiOperation({ summary: 'Get all services in a location' })
  @ApiOkResponse({
    schema: {
      example: {
        services: [],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing locationId or invalid filters' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getServices(@Query() query: GetCalendarServicesQueryDto) {
    return this.gohighlevelService.getCalendarServicesCatalog(query);
  }

  @Get('calendars/services/locations')
  @ApiOperation({ summary: 'Get all service locations in a location' })
  @ApiOkResponse({
    schema: {
      example: {
        serviceLocations: [],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing locationId' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getServiceLocations(@Query() query: GetCalendarServiceLocationsQueryDto) {
    return this.gohighlevelService.getCalendarServiceLocations(query);
  }

  @Get('calendars/events')
  @ApiOperation({ summary: 'Get calendar events by time range and owner filter' })
  @ApiOkResponse({
    schema: {
      example: {
        events: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Missing locationId/startTime/endTime or missing one of userId/groupId/calendarId',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getCalendarEvents(@Query() query: GetCalendarEventsQueryDto) {
    return this.gohighlevelService.getCalendarEvents(query);
  }

  @Get('calendars/events/appointments/:eventId')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiOkResponse({
    schema: {
      example: {
        event: {},
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing eventId or invalid request' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getAppointmentById(
    @Param('eventId') eventId: string,
    @Query() query: GohighlevelAccessTokenQueryDto,
  ) {
    return this.gohighlevelService.getAppointmentById(eventId, query);
  }

  @Get('calendars/blocked-slots')
  @ApiOperation({ summary: 'Get blocked slots by time range and owner filter' })
  @ApiOkResponse({
    schema: {
      example: {
        events: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Missing locationId/startTime/endTime or missing one of userId/groupId/calendarId',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getBlockedSlots(@Query() query: GetCalendarEventsQueryDto) {
    return this.gohighlevelService.getBlockedSlots(query);
  }

  @Get('calendars/:calendarId')
  @ApiOperation({ summary: 'Get calendar by ID' })
  @ApiOkResponse({
    schema: {
      example: {
        calendar: {},
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing calendarId or invalid request' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  getCalendarById(
    @Param('calendarId') calendarId: string,
    @Query() query: GohighlevelAccessTokenQueryDto,
  ) {
    return this.gohighlevelService.getCalendarById(calendarId, query);
  }

  @Post('calendars/events/appointments')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create appointment' })
  @ApiOkResponse({
    schema: {
      example: {
        id: '0TkCdp9PfvLeWKYRRvIz',
        calendarId: 'CVokAlI8fgw4WYWoCtQz',
        locationId: 'C2QujeCh8ZnC7al2InWR',
        contactId: '0007BWpSzSwfiuSl0tR2',
        startTime: '2021-06-23T03:30:00+05:30',
        endTime: '2021-06-23T04:30:00+05:30',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Missing required fields (contactId/startTime and calendarId/locationId via body or env)',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  createAppointment(@Body() body: CreateAppointmentDto) {
    return this.gohighlevelService.createAppointment(body);
  }

  @Post('webhooks/appointments/create')
  @HttpCode(202)
  @ApiOperation({
    summary: 'GoHighLevel webhook receiver for AppointmentCreate events',
  })
  @ApiOkResponse({
    schema: {
      example: {
        accepted: true,
        appointmentId: '0TkCdp9PfvLeWKYRRvIz',
        queuedSync: true,
      },
    },
  })
  async appointmentCreateWebhook(@Body() body: GhlAppointmentCreateWebhookDto) {
    return this.gohighlevelService.ingestAppointmentCreateWebhook(
      {
        locationId: body.locationId,
        appointment: {
          ...body.appointment,
          id: body.appointment.id,
        },
      },
      { enqueueSync: true },
    );
  }

  @Post('webhooks/appointments/delete')
  @HttpCode(202)
  @ApiOperation({
    summary: 'GoHighLevel webhook receiver for AppointmentDelete events',
  })
  appointmentDeleteWebhook(
    @Body() body: GhlAppointmentMutationWebhookDto,
  ) {
    if (body.type !== 'AppointmentDelete') {
      return { accepted: false, reason: 'Wrong webhook type for endpoint' };
    }

    return this.gohighlevelService.ingestAppointmentMutationWebhook(
      {
        locationId: body.locationId,
        appointment: body.appointment as unknown as Record<string, unknown>,
      },
      'AppointmentDelete',
      { enqueueSync: true },
    );
  }

  @Post('webhooks/appointments/update')
  @HttpCode(202)
  @ApiOperation({
    summary: 'GoHighLevel webhook receiver for AppointmentUpdate events',
  })
  appointmentUpdateWebhook(
    @Body() body: GhlAppointmentMutationWebhookDto,
  ) {
    if (body.type !== 'AppointmentUpdate') {
      return { accepted: false, reason: 'Wrong webhook type for endpoint' };
    }

    return this.gohighlevelService.ingestAppointmentMutationWebhook(
      {
        locationId: body.locationId,
        appointment: body.appointment as unknown as Record<string, unknown>,
      },
      'AppointmentUpdate',
      { enqueueSync: true },
    );
  }

  @Put('calendars/events/appointments/:eventId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update appointment by ID' })
  @ApiOkResponse({
    schema: {
      example: {
        id: '0TkCdp9PfvLeWKYRRvIz',
        calendarId: 'CVokAlI8fgw4WYWoCtQz',
        locationId: 'C2QujeCh8ZnC7al2InWR',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing eventId or invalid request body' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  updateAppointment(
    @Param('eventId') eventId: string,
    @Body() body: UpdateAppointmentDto,
  ) {
    return this.gohighlevelService.updateAppointment(eventId, body);
  }

  @Delete('calendars/events/:eventId')
  @HttpCode(201)
  @ApiOperation({ summary: 'Delete event by ID' })
  @ApiOkResponse({
    schema: {
      example: {
        succeeded: true,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing eventId' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing location access token',
  })
  deleteEvent(@Param('eventId') eventId: string, @Body() body: DeleteEventDto) {
    return this.gohighlevelService.deleteEvent(eventId, body);
  }
}
