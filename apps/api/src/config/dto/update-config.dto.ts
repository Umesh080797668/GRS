import {
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  Max,
  Matches,
  IsUrl,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export class UpdateConfigDto {
  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, {
    message:
      'min_supported_version must be a valid semantic version (e.g. 1.0.0)',
  })
  min_supported_version?: string;

  @ApiPropertyOptional({ example: '1.2.0' })
  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, {
    message: 'latest_version must be a valid semantic version (e.g. 1.2.0)',
  })
  latest_version?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  agent_can_edit_synced?: boolean;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'sync_jitter_max_s cannot be negative' })
  @Max(300, { message: 'sync_jitter_max_s cannot exceed 300 seconds' })
  sync_jitter_max_s?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'sync_batch_max must be at least 1' })
  @Max(500, { message: 'sync_batch_max cannot exceed 500' })
  sync_batch_max?: number;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/grs-release.apk',
  })
  @IsOptional()
  @IsString()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'apk_download_url must be a valid http or https URL' },
  )
  apk_download_url?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'initial_password_ttl_days must be at least 1' })
  @Max(365, { message: 'initial_password_ttl_days cannot exceed 365' })
  initial_password_ttl_days?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  web_data_entry_enabled?: boolean;

  @ApiPropertyOptional({
    example: ['cdc_secretary', 'sda', 'dc', 'admin'],
    description:
      'Roles permitted to perform direct web data entry (Decision C19)',
  })
  @IsOptional()
  web_entry_roles?: string[];

  // CamelCase equivalents for convenience
  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX)
  minSupportedVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX)
  latestVersion?: string;

  @IsOptional()
  @IsBoolean()
  agentCanEditSynced?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  syncJitterMaxS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  syncBatchMax?: number;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  apkDownloadUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  initialPasswordTtlDays?: number;

  @IsOptional()
  @IsBoolean()
  webDataEntryEnabled?: boolean;

  @IsOptional()
  webEntryRoles?: string[];
}
