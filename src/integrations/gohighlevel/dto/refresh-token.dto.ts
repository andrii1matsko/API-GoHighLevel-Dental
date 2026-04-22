import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class RefreshGohighlevelTokenDto {
  @ApiProperty({
    example: 'xy34dc0ae1234a4858f9ff06d4f66ba',
    description: 'Refresh token received from GoHighLevel OAuth install flow',
  })
  @IsString()
  refreshToken!: string;

  @ApiPropertyOptional({
    example: 'Location',
    enum: ['Company', 'Location'],
    description:
      'Token scope type. Defaults to Location when not explicitly provided.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Company', 'Location'])
  userType?: 'Company' | 'Location';
}
