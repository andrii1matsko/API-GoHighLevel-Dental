import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class LeyrAppointmentConfirmationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmed_by?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmation_note?: string;
}

export class UpdateLeyrAppointmentDto {
  @ApiPropertyOptional({
    example: 'cancelled',
    description:
      'Currently only "cancelled" is supported. When provided, other fields are ignored.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  status?: string | null;

  @ApiPropertyOptional({
    example: '2026-05-22T15:35:00+02:00',
    description: 'Appointment start datetime in ISO 8601 format',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  start?: string | null;

  @ApiPropertyOptional({
    example: '2026-05-22T16:05:00+02:00',
    description: 'Appointment end datetime in ISO 8601 format',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  end?: string | null;

  @ApiPropertyOptional({
    example: 'service-123',
    description: 'Healthcare service id',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  healthcare_service_id?: string | null;

  @ApiPropertyOptional({
    example: 'resource-123',
    description: 'Resource id',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  resource_id?: string | null;

  @ApiPropertyOptional({
    example: 'Updated comment',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  comment?: string | null;

  @ApiPropertyOptional({
    description: 'Appointment confirmation data, when required',
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  confirmation?: LeyrAppointmentConfirmationDto | null;
}
