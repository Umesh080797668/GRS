import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import { UpdateConfigDto, SEMVER_REGEX } from './dto/update-config.dto';

const KEY_MAPPINGS: Record<string, string> = {
  min_supported_version: 'min_supported_version',
  minSupportedVersion: 'min_supported_version',
  latest_version: 'latest_version',
  latestVersion: 'latest_version',
  agent_can_edit_synced: 'agent_can_edit_synced',
  agentCanEditSynced: 'agent_can_edit_synced',
  sync_jitter_max_s: 'sync_jitter_max_s',
  syncJitterMaxS: 'sync_jitter_max_s',
  sync_batch_max: 'sync_batch_max',
  syncBatchMax: 'sync_batch_max',
  apk_download_url: 'apk_download_url',
  apkDownloadUrl: 'apk_download_url',
  initial_password_ttl_days: 'initial_password_ttl_days',
  initialPasswordTtlDays: 'initial_password_ttl_days',
  web_data_entry_enabled: 'web_data_entry_enabled',
  webDataEntryEnabled: 'web_data_entry_enabled',
  web_entry_roles: 'web_entry_roles',
  webEntryRoles: 'web_entry_roles',
  consent_version: 'consent_version',
  consentVersion: 'consent_version',
};

@Controller('v1/config')
export class AppConfigController {
  constructor(private readonly configService: AppConfigService) { }

  @Get()
  async getConfig() {
    return this.configService.getConfig();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin)
  async updateConfig(@Body() body: UpdateConfigDto) {
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new BadRequestException({
        code: 'INVALID_CONFIG_PAYLOAD',
        message: 'Config update body cannot be empty',
      });
    }

    // Check min_supported_version <= latest_version only when either is explicitly provided
    const hasMin =
      body.min_supported_version !== undefined ||
      (body as any).minSupportedVersion !== undefined;
    const hasLatest =
      body.latest_version !== undefined ||
      (body as any).latestVersion !== undefined;

    if (hasMin || hasLatest) {
      const currentConfig = await this.configService.getConfig();
      const targetMin =
        body.min_supported_version ??
        (body as any).minSupportedVersion ??
        currentConfig.minSupportedVersion;
      const targetLatest =
        body.latest_version ??
        (body as any).latestVersion ??
        currentConfig.latestVersion;

      if (
        targetMin &&
        targetLatest &&
        SEMVER_REGEX.test(String(targetMin)) &&
        SEMVER_REGEX.test(String(targetLatest)) &&
        this.configService.compareSemver(
          String(targetMin),
          String(targetLatest),
        ) > 0
      ) {
        throw new BadRequestException({
          code: 'INVALID_CONFIG_VALUE',
          message: 'min_supported_version cannot exceed latest_version',
        });
      }
    }

    let updatedCount = 0;
    for (const [key, rawValue] of Object.entries(body)) {
      if (rawValue === undefined) {
        continue;
      }
      updatedCount++;
      const canonicalKey = KEY_MAPPINGS[key];
      if (!canonicalKey) {
        throw new BadRequestException({
          code: 'INVALID_CONFIG_KEY',
          message: `Unknown config key: ${key}`,
        });
      }

      // Explicit range & type validation checks
      if (
        canonicalKey === 'min_supported_version' ||
        canonicalKey === 'latest_version'
      ) {
        if (typeof rawValue !== 'string' || !SEMVER_REGEX.test(rawValue)) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: `${key} must be a valid semantic version string (e.g. 1.0.0)`,
          });
        }
      } else if (canonicalKey === 'sync_jitter_max_s') {
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num < 0 || num > 300) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: 'sync_jitter_max_s must be an integer between 0 and 300',
          });
        }
      } else if (canonicalKey === 'sync_batch_max') {
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num < 1 || num > 500) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: 'sync_batch_max must be an integer between 1 and 500',
          });
        }
      } else if (canonicalKey === 'initial_password_ttl_days') {
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num < 1 || num > 365) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message:
              'initial_password_ttl_days must be an integer between 1 and 365',
          });
        }
      } else if (canonicalKey === 'apk_download_url') {
        if (typeof rawValue !== 'string' || !rawValue.startsWith('https://')) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: 'apk_download_url must be a valid https URL',
          });
        }
      } else if (
        canonicalKey === 'agent_can_edit_synced' ||
        canonicalKey === 'web_data_entry_enabled'
      ) {
        if (typeof rawValue !== 'boolean') {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: `${key} must be a boolean`,
          });
        }
      } else if (canonicalKey === 'web_entry_roles') {
        const validRoles = Object.values(UserRole) as string[];
        if (
          !Array.isArray(rawValue) ||
          !rawValue.every(
            (r) => typeof r === 'string' && validRoles.includes(r),
          )
        ) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: `web_entry_roles must be an array of valid role strings: ${validRoles.join(', ')}`,
          });
        }
      } else if (canonicalKey === 'consent_version') {
        if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
          throw new BadRequestException({
            code: 'INVALID_CONFIG_VALUE',
            message: 'consent_version must be a non-empty string',
          });
        }
      }

      await this.configService.updateSetting(canonicalKey, rawValue);

      // When web_data_entry_enabled is toggled for super_admin (Decision C19), sync web_entry_roles
      if (canonicalKey === 'web_data_entry_enabled') {
        const currentRolesSetting = await this.configService.getSetting(
          'web_entry_roles',
          ['cdc_secretary', 'sda', 'dc', 'admin'],
        );
        let roles: string[] = Array.isArray(currentRolesSetting)
          ? [...currentRolesSetting]
          : ['cdc_secretary', 'sda', 'dc', 'admin'];
        if (rawValue === true) {
          if (!roles.includes('super_admin')) roles.push('super_admin');
        } else {
          roles = roles.filter((r) => r !== 'super_admin');
        }
        await this.configService.updateSetting('web_entry_roles', roles);
      } else if (
        canonicalKey === 'web_entry_roles' &&
        Array.isArray(rawValue)
      ) {
        await this.configService.updateSetting(
          'web_data_entry_enabled',
          rawValue.includes('super_admin'),
        );
      }
    }

    if (updatedCount === 0) {
      throw new BadRequestException({
        code: 'INVALID_CONFIG_PAYLOAD',
        message: 'Config update body cannot be empty',
      });
    }

    return this.configService.getConfig();
  }
}
