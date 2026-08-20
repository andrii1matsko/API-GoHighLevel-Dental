import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GohighlevelTokenResponseDto {
  @ApiProperty({ example: 'ab12dc0ae1234a7898f9ff06d4f69gh' })
  access_token!: string;

  @ApiProperty({ example: 'Bearer' })
  token_type!: string;

  @ApiProperty({ example: 86399 })
  expires_in!: number;

  @ApiProperty({ example: 'xy34dc0ae1234a4858f9ff06d4f66ba' })
  refresh_token!: string;

  @ApiProperty({
    example: 'conversations/message.readonly conversations/message.write',
  })
  scope!: string;

  @ApiProperty({ example: 'Location' })
  userType!: string;

  @ApiPropertyOptional({ example: 'l1C08ntBrFjLS0elLIYU' })
  locationId?: string;

  @ApiPropertyOptional({ example: 'l1C08ntBrFjLS0elLIYU' })
  companyId?: string;

  @ApiPropertyOptional({ example: ['l1C08ntBrFjLS0elLIYU'] })
  approvedLocations?: string[];

  @ApiProperty({ example: 'l1C08ntBrFjLS0elLIYU' })
  userId!: string;

  @ApiPropertyOptional({ example: 'l1C08ntBrFjLS0elLIYU' })
  planId?: string;

  @ApiPropertyOptional({ example: false })
  isBulkInstallation?: boolean;

  @ApiPropertyOptional({ example: true })
  installToFutureLocations?: boolean;

  @ApiPropertyOptional({ example: true })
  approveAllLocations?: boolean;
}
