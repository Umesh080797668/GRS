import { IsOptional, IsString, IsInt, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncAreaDto {
  @ApiPropertyOptional({
    description:
      'Resumable pagination cursor (UUID of last received household)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of households per page (max 500 per Build Plan §6.2)',
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 500;

  @ApiPropertyOptional({
    description: 'Filter area download to specific assigned GN division UUID',
  })
  @IsOptional()
  @IsUUID()
  gnId?: string;
}
