import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncChangesDto {
  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp of last sync cursor. Returns changes since this timestamp.',
  })
  @IsOptional()
  @IsString()
  since?: string;
}

export interface SyncChangesResponse {
  serverTime: string;
  households: any[];
  deletedHouseholds: Array<{
    id: string;
    deletedAt: string;
    deletedReason?: string | null;
  }>;
  clients: any[];
}
