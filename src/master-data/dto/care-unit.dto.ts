import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateCareUnitDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  emrId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({
    example: {
      address_line: 'Jenssenroa 9',
      city: 'Geirberg',
      postcode: '6712',
      country: 'PE',
    },
  })
  @IsObject()
  address: Record<string, unknown>;

  @ApiProperty({ example: 0 })
  @IsInt()
  instanceId: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  instanceName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  phones?: Prisma.InputJsonValue | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  emails?: Prisma.InputJsonValue | null;
}

export class UpdateCareUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emrId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  instanceId?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  instanceName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  phones?: Prisma.InputJsonValue | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  emails?: Prisma.InputJsonValue | null;
}
