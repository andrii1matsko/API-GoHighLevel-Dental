import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class LeyrBackedFreeSlotsQueryDto {
  @ApiProperty({
    example: 1789084800000,
    description: 'Start date in milliseconds (max 31-day range)',
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  startDate!: number;

  @ApiProperty({
    example: 1789171200000,
    description: 'End date in milliseconds (max 31-day range)',
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  endDate!: number;

  @ApiPropertyOptional({
    example: 'Europe/Stockholm',
    description: 'Timezone used to group slots by calendar day',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: '4VkUtem3g9U6HTlhHoX9',
    description: 'Optional GHL staff user id — limits slots to that clinician',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
