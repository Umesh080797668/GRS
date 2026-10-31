import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncRecordPayloadDto {
  @ApiPropertyOptional({ default: 'client' })
  @IsOptional()
  @IsString()
  type?: string = 'client';

  @ApiProperty({ description: 'Client record UUID' })
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiPropertyOptional({ description: 'Base server version known to client', default: 0 })
  @IsOptional()
  @IsInt()
  base_version?: number = 0;

  @ApiPropertyOptional({ description: 'Client update timestamp in ISO format' })
  @IsOptional()
  @IsString()
  client_updated_at?: string;

  @ApiProperty({ description: 'Client record data payload with 47 fields' })
  @IsNotEmpty()
  data!: Record<string, any>;
}

export class SyncPushDto {
  @ApiProperty({ description: 'Device unique identifier' })
  @IsNotEmpty()
  @IsString()
  device_id!: string;

  @ApiProperty({ description: 'Client mobile application version' })
  @IsNotEmpty()
  @IsString()
  app_version!: string;

  @ApiPropertyOptional({ description: 'Database schema version', default: 1 })
  @IsOptional()
  @IsInt()
  schema_version?: number = 1;

  @ApiProperty({
    description: 'Array of records to sync (up to 50 records per batch per Build Plan §8.3)',
    type: [SyncRecordPayloadDto],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncRecordPayloadDto)
  records!: SyncRecordPayloadDto[];
}

export interface SyncRecordResultItem {
  id: string;
  status: 'ok' | 'stale' | 'rejected' | 'forbidden' | 'locked';
  server_version?: number;
  code?: string;
  message?: string;
}

export interface SyncPushResponse {
  results: SyncRecordResultItem[];
}
