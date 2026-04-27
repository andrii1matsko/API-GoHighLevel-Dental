import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class GhlAppointmentWebhookPayloadDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  calendarId!: string;

  @ApiProperty()
  @IsString()
  contactId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  users?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty()
  @IsString()
  startTime!: string;

  @ApiProperty()
  @IsString()
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateAdded?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateUpdated?: string;
}

export class GhlAppointmentCreateWebhookDto {
  @ApiProperty({ example: 'AppointmentCreate' })
  @IsString()
  @IsIn(['AppointmentCreate'])
  type!: 'AppointmentCreate';

  @ApiProperty()
  @IsString()
  locationId!: string;

  @ApiProperty({ type: GhlAppointmentWebhookPayloadDto })
  @ValidateNested()
  @Type(() => GhlAppointmentWebhookPayloadDto)
  appointment!: GhlAppointmentWebhookPayloadDto;
}

