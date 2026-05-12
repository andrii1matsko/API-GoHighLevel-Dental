import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DndSetting {
  @ApiPropertyOptional({ example: 'SMS' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Outcomes API' })
  @IsOptional()
  @IsString()
  message?: string;
}

class InboundDndSetting {
  @ApiPropertyOptional({ example: 'SMS' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Outcomes API' })
  @IsOptional()
  @IsString()
  message?: string;
}

class DndSettings {
  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  Call?: DndSetting;

  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  Email?: DndSetting;

  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  SMS?: DndSetting;

  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  WhatsApp?: DndSetting;

  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  GMB?: DndSetting;

  @ApiPropertyOptional({ type: DndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSetting)
  FB?: DndSetting;
}

class InboundDndSettings {
  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  Call?: InboundDndSetting;

  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  Email?: InboundDndSetting;

  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  SMS?: InboundDndSetting;

  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  WhatsApp?: InboundDndSetting;

  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  GMB?: InboundDndSetting;

  @ApiPropertyOptional({ type: InboundDndSetting })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSetting)
  FB?: InboundDndSetting;
}

class GhlCustomField {
  @ApiProperty({ example: '6dvNaf7VhkQ9snc5jnbaLk' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 'custom field key' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  field_value?: unknown;
}

export class CreateContactDto {
  @ApiPropertyOptional({
    description: 'Override location access token for this request',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Rosan', nullable: true })
  @IsOptional()
  @IsString()
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Deo', nullable: true })
  @IsOptional()
  @IsString()
  lastName?: string | null;

  @ApiPropertyOptional({ example: 'Rosan Deo', nullable: true })
  @IsOptional()
  @IsString()
  name?: string | null;

  @ApiPropertyOptional({ example: 'rosan@deos.com', nullable: true })
  @IsOptional()
  @IsString()
  email?: string | null;

  @ApiPropertyOptional({ example: '+1 888-888-8888', nullable: true })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiProperty({
    example: 've9EPM428h8vShlRW1KT',
    description: 'Location Id the contact should be created under',
  })
  @IsString()
  locationId!: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '3535 1st St N', nullable: true })
  @IsOptional()
  @IsString()
  address1?: string | null;

  @ApiPropertyOptional({ example: 'Dolomite', nullable: true })
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiPropertyOptional({ example: 'AL', nullable: true })
  @IsOptional()
  @IsString()
  state?: string | null;

  @ApiPropertyOptional({ example: '35061' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'https://www.tesla.com', nullable: true })
  @IsOptional()
  @IsString()
  website?: string | null;

  @ApiPropertyOptional({ example: 'America/Chihuahua', nullable: true })
  @IsOptional()
  @IsString()
  timezone?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  dnd?: boolean;

  @ApiPropertyOptional({ type: DndSettings })
  @IsOptional()
  @ValidateNested()
  @Type(() => DndSettings)
  dndSettings?: DndSettings;

  @ApiPropertyOptional({ type: InboundDndSettings })
  @IsOptional()
  @ValidateNested()
  @Type(() => InboundDndSettings)
  inboundDndSettings?: InboundDndSettings;

  @ApiPropertyOptional({
    example: ['nisi sint commodo amet', 'consequat'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [GhlCustomField] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GhlCustomField)
  customFields?: GhlCustomField[];

  @ApiPropertyOptional({ example: 'public api' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    example: '1990-09-25',
    nullable: true,
    description:
      'Birth date. Formats: YYYY/MM/DD, MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY, etc.',
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({
    example: 'US',
    description: 'Country code (ISO 3166-1 alpha-2)',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'DGS VolMAX', nullable: true })
  @IsOptional()
  @IsString()
  companyName?: string | null;

  @ApiPropertyOptional({
    example: 'y0BeYjuRIlDwsDcOHOJo',
    description: "Assigned user's Id",
  })
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class GetContactQueryDto {
  @ApiPropertyOptional({
    description: 'Override location access token for this request',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class DeleteContactQueryDto {
  @ApiPropertyOptional({
    description: 'Override location access token for this request',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}

class SearchContactFilter {
  @ApiPropertyOptional({ example: 'firstNameLowerCase' })
  @IsOptional()
  @IsString()
  field?: string;

  @ApiPropertyOptional({
    example: 'eq',
    enum: ['eq', 'not_eq', 'contains', 'not_contains', 'exists', 'not_exists', 'range'],
  })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  value?: unknown;

  @ApiPropertyOptional({ enum: ['AND', 'OR'] })
  @IsOptional()
  @IsString()
  group?: 'AND' | 'OR';

  @ApiPropertyOptional({ type: () => [SearchContactFilter] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchContactFilter)
  filters?: SearchContactFilter[];
}

class SearchContactSort {
  @ApiProperty({ example: 'firstNameLowerCase' })
  @IsString()
  field!: string;

  @ApiProperty({ example: 'asc', enum: ['asc', 'desc'] })
  @IsString()
  direction!: 'asc' | 'desc';
}

export class SearchContactsDto {
  @ApiPropertyOptional({
    description: 'Override location access token for this request',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiProperty({
    example: 've9EPM428h8vShlRW1KT',
    description: 'Location ID to search within',
  })
  @IsString()
  locationId!: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number (standard pagination)' })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'Results per page (max 500)' })
  @IsOptional()
  @IsNumber()
  pageLimit?: number;

  @ApiPropertyOptional({
    description: 'Cursor for pagination beyond 10,000 records',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  searchAfter?: string[];

  @ApiPropertyOptional({ type: [SearchContactFilter] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchContactFilter)
  filters?: SearchContactFilter[];

  @ApiPropertyOptional({ type: [SearchContactSort] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchContactSort)
  sort?: SearchContactSort[];

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Free-text query to run against searchable fields (max 75 chars)',
  })
  @IsOptional()
  @IsString()
  query?: string;
}

export class SearchContactsByNameDto {
  @ApiPropertyOptional({
    description: 'Override location access token for this request',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'Location ID to search within (falls back to env config)',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ example: 'John', description: 'First name of the contact' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name of the contact' })
  @IsString()
  lastName!: string;
}
