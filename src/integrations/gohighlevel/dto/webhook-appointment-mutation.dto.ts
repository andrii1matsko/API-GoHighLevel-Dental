import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class AppointmentWebhookPayloadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  calendarId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  contactId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  appointmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  assignedUserId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  users?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  source?: string;

  @ApiProperty({ description: 'ISO 8601 datetime string' })
  @IsString()
  @IsNotEmpty()
  @IsDateString()
  startTime!: string;

  @ApiProperty({ description: 'ISO 8601 datetime string' })
  @IsString()
  @IsNotEmpty()
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateAdded?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateUpdated?: string;

  @ApiPropertyOptional({
    description: 'IANA timezone sent by some GHL calendar payloads',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class GhlAppointmentMutationWebhookDto {
  @ApiProperty({ example: 'AppointmentUpdate' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['AppointmentUpdate', 'AppointmentDelete'])
  type!: 'AppointmentUpdate' | 'AppointmentDelete';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  locationId!: string;

  @ApiPropertyOptional({ description: 'Webhook delivery timestamp from GHL' })
  @IsOptional()
  @IsString()
  timestamp?: string;

  @ApiPropertyOptional({ description: 'Webhook event id from GHL' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @ApiProperty({ type: AppointmentWebhookPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AppointmentWebhookPayloadDto)
  appointment!: AppointmentWebhookPayloadDto;
}
