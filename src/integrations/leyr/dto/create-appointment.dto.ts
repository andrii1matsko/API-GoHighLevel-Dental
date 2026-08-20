import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateLeyrAppointmentDto {
  @ApiProperty({
    example: '2019-08-24T14:15:22Z',
    description: 'Appointment start datetime in ISO 8601 format',
  })
  @IsDateString()
  start!: string;

  @ApiProperty({
    example: '2019-08-24T15:15:22Z',
    description: 'Appointment end datetime in ISO 8601 format',
  })
  @IsDateString()
  end!: string;

  @ApiProperty({
    example: 'service-123',
    description: 'Leyr healthcare service id',
  })
  @IsString()
  healthcare_service_id!: string;

  @ApiProperty({
    example: 'resource-123',
    description: 'Leyr resource id',
  })
  @IsString()
  resource_id!: string;

  @ApiProperty({
    example: 'patient-123',
    description: 'Patient external id',
  })
  @IsString()
  patient_id!: string;

  @ApiPropertyOptional({
    example: 'L0_64fc933b-a94a-40ef-b00a-bbba40c2076d',
    description: 'Care unit id (required by some EMRs in the request body)',
  })
  @IsOptional()
  @IsString()
  care_unit_id?: string;

  @ApiPropertyOptional({
    example: 'Patient requested first available slot',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  comment?: string | null;
}
