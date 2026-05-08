import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SyncHistoryQueryDto {
  @ApiPropertyOptional({
    example: 'pending',
    enum: ['pending', 'success', 'failed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'success', 'failed'])
  status?: string;

  @ApiPropertyOptional({
    example: 'GHL_TO_LEYR',
    enum: ['GHL_TO_LEYR', 'LEYR_TO_GHL'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['GHL_TO_LEYR', 'LEYR_TO_GHL'])
  direction?: string;

  @ApiPropertyOptional({ example: 'LEYR', description: 'Source system filter' })
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00Z',
    description: 'Filter syncs created after this ISO datetime',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59Z',
    description: 'Filter syncs created before this ISO datetime',
  })
  @IsOptional()
  @IsString()
  to?: string;
}
