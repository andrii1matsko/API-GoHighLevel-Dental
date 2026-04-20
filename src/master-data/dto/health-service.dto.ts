import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateHealthServiceDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  emrId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  price?: number | null;

  @ApiProperty()
  @IsInt()
  duration: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string | null;

  @ApiProperty()
  @IsString()
  careUnitId: string;
}

export class UpdateHealthServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emrId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  price?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  duration?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careUnitId?: string;
}
