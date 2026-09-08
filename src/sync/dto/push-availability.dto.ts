import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PushAvailabilityDto {
  @ApiPropertyOptional({
    description:
      'Limit sync to one GHL location (e.g. Kållered YqUlz1ErFupeWjrXiiDJ)',
  })
  @IsOptional()
  @IsString()
  ghlLocationId?: string;

  @ApiPropertyOptional({
    description: 'Limit sync to one mapped GHL calendar id',
  })
  @IsOptional()
  @IsString()
  ghlCalendarId?: string;
}
