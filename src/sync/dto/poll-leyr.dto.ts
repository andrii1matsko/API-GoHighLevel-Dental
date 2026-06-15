import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PollLeyrDto {
  @ApiPropertyOptional({
    description:
      'Optional care unit ID to poll a specific clinic. If omitted, polls all enabled clinics.',
    example: 'L0_64fc933b-a94a-40ef-b00a-bbba40c2076d',
  })
  @IsOptional()
  @IsString()
  careUnitId?: string;
}
