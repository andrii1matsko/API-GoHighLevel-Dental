import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// ---------------------------------------------------------------------------
// Facility (Calendar Group ↔ Care Unit)
// ---------------------------------------------------------------------------

export class CreateFacilityMappingDto {
  @ApiProperty({
    example: 'loc_abc123',
    description: 'GHL sub-account location ID',
  })
  @IsString()
  ghlLocationId!: string;

  @ApiProperty({ example: 'grp_xyz789', description: 'GHL calendar group ID' })
  @IsString()
  ghlGroupId!: string;

  @ApiPropertyOptional({ example: 'City Hospital' })
  @IsOptional()
  @IsString()
  ghlGroupName?: string;

  @ApiProperty({ example: 'cu-001', description: 'Leyr care unit ID' })
  @IsString()
  leyrCareUnitId!: string;

  @ApiProperty({ example: 'opus', description: 'Leyr EMR code' })
  @IsString()
  leyrEmr!: string;

  @ApiPropertyOptional({ example: 'City Hospital' })
  @IsOptional()
  @IsString()
  leyrCareUnitName?: string;
}

// ---------------------------------------------------------------------------
// Calendar ↔ Healthcare Service
// ---------------------------------------------------------------------------

export class CreateCalendarServiceMappingDto {
  @ApiProperty({ description: 'ID of the parent FacilityMapping' })
  @IsString()
  facilityMappingId!: string;

  @ApiProperty({
    example: 'cal_abc123',
    description: 'GHL service calendar ID',
  })
  @IsString()
  ghlCalendarId!: string;

  @ApiPropertyOptional({ example: 'General Consultation' })
  @IsOptional()
  @IsString()
  ghlCalendarName?: string;

  @ApiProperty({ example: 'hs-001', description: 'Leyr healthcare service ID' })
  @IsString()
  leyrHealthcareServiceId!: string;

  @ApiPropertyOptional({ example: 'General Consultation' })
  @IsOptional()
  @IsString()
  leyrServiceName?: string;
}

// ---------------------------------------------------------------------------
// Staff ↔ Resource
// ---------------------------------------------------------------------------

export class CreateStaffResourceMappingDto {
  @ApiProperty({ description: 'ID of the parent FacilityMapping' })
  @IsString()
  facilityMappingId!: string;

  @ApiProperty({ example: 'user_abc123', description: 'GHL staff/user ID' })
  @IsString()
  ghlUserId!: string;

  @ApiPropertyOptional({ example: 'Dr. Smith' })
  @IsOptional()
  @IsString()
  ghlUserName?: string;

  @ApiPropertyOptional({ example: 'dr.smith@hospital.com' })
  @IsOptional()
  @IsString()
  ghlUserEmail?: string;

  @ApiProperty({ example: 'res-001', description: 'Leyr resource ID' })
  @IsString()
  leyrResourceId!: string;

  @ApiPropertyOptional({ example: 'Dr. Smith' })
  @IsOptional()
  @IsString()
  leyrResourceName?: string;
}

// ---------------------------------------------------------------------------
// Discover request
// ---------------------------------------------------------------------------

export class DiscoverMappingsQueryDto {
  @ApiPropertyOptional({
    example: 've9EPM428h8vShlRW1KT',
    description: 'GHL location ID (falls back to env)',
  })
  @IsOptional()
  @IsString()
  ghlLocationId?: string;

  @ApiPropertyOptional({
    example: 'opus',
    description: 'Leyr EMR code (falls back to env LEYR_EMR)',
  })
  @IsOptional()
  @IsString()
  leyrEmr?: string;
}
