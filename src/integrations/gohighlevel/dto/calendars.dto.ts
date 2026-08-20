import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetCalendarsQueryDto {
  @ApiPropertyOptional({
    example: 've9EPM428h8vShlRW1KT',
    description:
      'Location Id. Optional if GHL_LOCATION_ID_OAUTH is set in environment.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({
    example: 'BqTwX8QFwXzpegMve9EQ',
    description: 'Optional group ID filter',
  })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Show drafted calendars',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  showDrafted?: boolean;

  @ApiPropertyOptional({
    example: 'ab12dc0ae1234a7898f9ff06d4f69gh',
    description:
      'Optional location access token override. If omitted, service uses GHL_LOCATION_ACCESS_TOKEN env value.',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class GohighlevelAccessTokenQueryDto {
  @ApiPropertyOptional({
    example: 'ab12dc0ae1234a7898f9ff06d4f69gh',
    description:
      'Optional location access token override. If omitted, service uses GHL_LOCATION_ACCESS_TOKEN env value.',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class GohighlevelLocationScopedQueryDto extends GohighlevelAccessTokenQueryDto {
  @ApiPropertyOptional({
    example: 've9EPM428h8vShlRW1KT',
    description:
      'Location Id. Optional if GHL_LOCATION_ID_OAUTH is set in environment.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class GetCalendarFreeSlotsQueryDto extends GohighlevelAccessTokenQueryDto {
  @ApiProperty({
    example: 1548898600000,
    description:
      'Start date in milliseconds. Date range between startDate and endDate cannot exceed 31 days.',
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  startDate!: number;

  @ApiProperty({
    example: 1601490599999,
    description:
      'End date in milliseconds. Date range between startDate and endDate cannot exceed 31 days.',
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  endDate!: number;

  @ApiPropertyOptional({
    example: 'America/Chihuahua',
    description: 'Timezone used for free slot output',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: '082goXVW3lIExEQPOnd3',
    description: 'Optional user id filter',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    example: ['082goXVW3lIExEQPOnd3', '121goXVW3lIExEQPOnd8'],
    description: 'Optional list of user ids',
    type: [String],
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length > 0) return value.split(',');
    return value;
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}

export class GetCalendarServicesQueryDto extends GohighlevelLocationScopedQueryDto {
  @ApiPropertyOptional({
    example: '65e5f6dfacf123513228d384',
    description: 'Filter by service category ID',
  })
  @IsOptional()
  @IsString()
  serviceCategoryId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Filter services: true = private only, false = public only, unset = all services',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  isPrivate?: boolean;
}

export class GetCalendarServiceLocationsQueryDto extends GohighlevelLocationScopedQueryDto {}

export class GetCalendarEventsQueryDto extends GohighlevelLocationScopedQueryDto {
  @ApiPropertyOptional({
    example: 'CVokAlI8fgw4WYWoCtQz',
    description:
      'User Id - owner of an appointment. Either userId, groupId or calendarId is required.',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    example: 'BqTwX8QFwXzpegMve9EQ',
    description:
      'Calendar Id. Either calendarId, userId or groupId is required.',
  })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({
    example: 'ocQHyuzHvysMo5N5VsXc',
    description: 'Group Id. Either groupId, calendarId or userId is required.',
  })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiProperty({
    example: '1680373800000',
    description: 'Start Time in milliseconds',
  })
  @IsString()
  startTime!: string;

  @ApiProperty({
    example: '1680978599999',
    description: 'End Time in milliseconds',
  })
  @IsString()
  endTime!: string;
}

export class CreateAppointmentDto {
  @ApiPropertyOptional({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Test Event' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'custom',
    enum: ['custom', 'zoom', 'gmeet', 'phone', 'address', 'ms_teams', 'google'],
  })
  @IsOptional()
  @IsString()
  meetingLocationType?: string;

  @ApiPropertyOptional({ example: 'custom_0', default: 'default' })
  @IsOptional()
  @IsString()
  meetingLocationId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  overrideLocationConfig?: boolean;

  @ApiPropertyOptional({
    example: 'confirmed',
    enum: [
      'new',
      'confirmed',
      'cancelled',
      'showed',
      'noshow',
      'invalid',
      'completed',
      'active',
    ],
  })
  @IsOptional()
  @IsString()
  appointmentStatus?: string;

  @ApiPropertyOptional({ example: '0007BWpSzSwfiuSl0tR2' })
  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ApiPropertyOptional({ example: 'Booking a call to discuss the project' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Zoom' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  ignoreDateRange?: boolean;

  @ApiPropertyOptional({ example: false, default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  toNotify?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  ignoreFreeSlotValidation?: boolean;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;COUNT=5',
    description: 'RRULE for recurring events (RFC 5545)',
  })
  @IsOptional()
  @IsString()
  rrule?: string;

  @ApiPropertyOptional({
    example: 'CVokAlI8fgw4WYWoCtQz',
    description: 'Optional if GHL_CALENDAR_ID is set in env',
  })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({
    example: 'C2QujeCh8ZnC7al2InWR',
    description: 'Optional if location id is set in env',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ example: '0007BWpSzSwfiuSl0tR2' })
  @IsString()
  contactId!: string;

  @ApiProperty({ example: '2021-06-23T03:30:00+05:30' })
  @IsString()
  startTime!: string;

  @ApiPropertyOptional({ example: '2021-06-23T04:30:00+05:30' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Test Event' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'custom',
    enum: ['custom', 'zoom', 'gmeet', 'phone', 'address', 'ms_teams', 'google'],
  })
  @IsOptional()
  @IsString()
  meetingLocationType?: string;

  @ApiPropertyOptional({ example: 'custom_0', default: 'default' })
  @IsOptional()
  @IsString()
  meetingLocationId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  overrideLocationConfig?: boolean;

  @ApiPropertyOptional({
    example: 'confirmed',
    enum: [
      'new',
      'confirmed',
      'cancelled',
      'showed',
      'noshow',
      'invalid',
      'completed',
      'active',
    ],
  })
  @IsOptional()
  @IsString()
  appointmentStatus?: string;

  @ApiPropertyOptional({ example: '0007BWpSzSwfiuSl0tR2' })
  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ApiPropertyOptional({ example: 'Booking a call to discuss the project' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Zoom' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  ignoreDateRange?: boolean;

  @ApiPropertyOptional({ example: false, default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  toNotify?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  })
  @IsBoolean()
  ignoreFreeSlotValidation?: boolean;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;COUNT=5',
    description: 'RRULE for recurring events (RFC 5545)',
  })
  @IsOptional()
  @IsString()
  rrule?: string;

  @ApiPropertyOptional({ example: 'CVokAlI8fgw4WYWoCtQz' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({ example: '2021-06-23T03:30:00+05:30' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '2021-06-23T04:30:00+05:30' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class CreateBlockSlotDto {
  @ApiPropertyOptional({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Lunch Break' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'CVokAlI8fgw4WYWoCtQz',
    description: 'Either calendarId or assignedUserId can be set, not both.',
  })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({
    example: '0007BWpSzSwfiuSl0tR2',
    description: 'Either calendarId or assignedUserId can be set, not both.',
  })
  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ApiProperty({
    example: 'C2QujeCh8ZnC7al2InWR',
    description: 'Location Id',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ example: '2021-06-23T03:30:00+05:30' })
  @IsString()
  startTime!: string;

  @ApiPropertyOptional({ example: '2021-06-23T04:30:00+05:30' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class UpdateBlockSlotDto {
  @ApiPropertyOptional({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Lunch Break' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'CVokAlI8fgw4WYWoCtQz',
    description: 'Either calendarId or assignedUserId can be set, not both.',
  })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({
    example: '0007BWpSzSwfiuSl0tR2',
    description: 'Either calendarId or assignedUserId can be set, not both.',
  })
  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ApiPropertyOptional({
    example: 'C2QujeCh8ZnC7al2InWR',
    description: 'Location Id',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: '2021-06-23T03:30:00+05:30' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '2021-06-23T04:30:00+05:30' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class DeleteEventDto {
  @ApiPropertyOptional({
    example: 'ab12dc0ae1234a7898f9ff06d4f69gh',
    description:
      'Optional location access token override. If omitted, service uses env token values.',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}
