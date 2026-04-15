import { IsOptional, IsString } from 'class-validator';

export class TriggerSyncDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
