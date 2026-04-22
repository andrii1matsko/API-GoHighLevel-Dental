import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLocationTokenDto {
  @ApiPropertyOptional({
    example: 'l1C08ntBrFjLS0elLIYU',
    description:
      'Company ID of the location you want to request token for. Optional if GHL_COMPANY_ID is set in env.',
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    example: 'l1C08ntBrFjLS0elLIYU',
    description:
      'Location ID for which location access token is generated. Optional if GHL_LOCATION_ID_OAUTH is set in env.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({
    example: 'ab12dc0ae1234a7898f9ff06d4f69gh',
    description:
      'Optional agency access token override. If omitted, service uses GHL_AGENCY_ACCESS_TOKEN env value.',
  })
  @IsOptional()
  @IsString()
  agencyAccessToken?: string;
}

export class GohighlevelLocationTokenResponseDto {
  @ApiProperty({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  access_token!: string;

  @ApiProperty({ example: 'Bearer' })
  token_type!: string;

  @ApiProperty({
    example: 86399,
    description: 'Time in seconds remaining for token to expire',
  })
  expires_in!: number;

  @ApiProperty({
    example: 'conversations/message.readonly conversations/message.write',
  })
  scope!: string;

  @ApiProperty({ example: 'l1C08ntBrFjLS0elLIYU' })
  locationId!: string;

  @ApiPropertyOptional({ example: 'l1C08ntBrFjLS0elLIYU' })
  planId?: string;

  @ApiProperty({ example: 'l1C08ntBrFjLS0elLIYU' })
  userId!: string;

  @ApiPropertyOptional({ example: '6578278e879ad2646715ba9c' })
  appId?: string;

  @ApiPropertyOptional({ example: '6578278e879ad2646715ba9c' })
  versionId?: string;
}
