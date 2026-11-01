import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncChangesDto {
  @ApiPropertyOptional({
    description:
      'ISO-8601 timestamp of last sync cursor. Returns changes since this timestamp.',
  })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({
    description:
      'Resumable pagination cursor (UUID of last received household in changes feed)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Maximum number of updated households per page (default 500, max 1000)',
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 500;
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
  nextCursor?: string | null;
  hasMore: boolean;
}
