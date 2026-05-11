import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

enum LeyrGender {
  male = 'male',
  female = 'female',
  other = 'other',
  unknown = 'unknown',
}

enum LeyrTitle {
  Mr = 'Mr',
  Mrs = 'Mrs',
  Miss = 'Miss',
  Ms = 'Ms',
  Dr = 'Dr',
  Prof = 'Prof',
}

enum LeyrEthnicity {
  hispanic_or_latino = 'hispanic_or_latino',
  not_hispanic_or_latino = 'not_hispanic_or_latino',
  unreported = 'unreported',
  unknown = 'unknown',
}

class LeyrAddress {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  use?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  line?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postal_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;
}

class LeyrContact {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emails?: string[];
}

export class CreateLeyrPatientDto {
  @ApiPropertyOptional({ example: 'Jon', nullable: true })
  @IsOptional()
  @IsString()
  first_name?: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  @IsOptional()
  @IsString()
  last_name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  other_name?: string | null;

  @ApiPropertyOptional({
    example: '1990-01-15',
    description: 'Date of birth in ISO 8601 format (YYYY-MM-DD or full datetime)',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  birth_datetime?: string | null;

  @ApiPropertyOptional({
    enum: LeyrGender,
    description: "Person's administrative gender",
    nullable: true,
  })
  @IsOptional()
  @IsEnum(LeyrGender)
  gender?: LeyrGender | null;

  @ApiPropertyOptional({ type: [LeyrAddress], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeyrAddress)
  addresses?: LeyrAddress[];

  @ApiPropertyOptional({
    type: [String],
    example: ['+4712345123'],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['jon.doe@example.com'],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emails?: string[];

  @ApiPropertyOptional({
    example: '15068512345',
    description: 'External identifier (e.g. Personal Number in Sweden)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  external_id?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Language preferences' })
  @IsOptional()
  @IsObject()
  languages?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [LeyrContact], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeyrContact)
  contacts?: LeyrContact[];

  @ApiPropertyOptional({
    enum: LeyrTitle,
    description: "Patient's title (e.g. Mr, Mrs, Dr)",
    nullable: true,
  })
  @IsOptional()
  @IsEnum(LeyrTitle)
  title?: LeyrTitle | null;

  @ApiPropertyOptional({
    enum: LeyrEthnicity,
    description: "Patient's ethnicity code",
    nullable: true,
  })
  @IsOptional()
  @IsEnum(LeyrEthnicity)
  ethnicity?: LeyrEthnicity | null;

  @ApiPropertyOptional({
    description: 'EHR-specific payment plan ID to assign to the patient',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  payment_plan_id?: string | null;
}
