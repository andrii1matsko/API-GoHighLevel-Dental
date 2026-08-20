import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class StoreGohighlevelTokenDto {
  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  refreshToken!: string;

  @ApiProperty({ example: 86399 })
  @IsNumber()
  expiresIn!: number;

  @ApiProperty({ example: 'Company', enum: ['Company', 'Location'] })
  @IsString()
  @IsIn(['Company', 'Location'])
  userType!: 'Company' | 'Location';

  @ApiProperty({ example: 'GNb7aIv4rQFVb9iwNl5K' })
  @IsString()
  companyId!: string;

  @ApiPropertyOptional({ example: 'HjiMUOsCCHCjtxEf8PR' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: 'Bearer' })
  @IsOptional()
  @IsString()
  tokenType?: string;

  @ApiPropertyOptional({ example: 'calendars.readonly calendars.write' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ example: '685b558f21fa7b18e3d09a' })
  @IsOptional()
  @IsString()
  refreshTokenId?: string;

  @ApiPropertyOptional({ example: 'Rg6BRRiHh7dS9gJy3W8a' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isBulkInstallation?: boolean;
}
