import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AppConfig {
  minSupportedVersion: string;
  latestVersion: string;
  agentCanEditSynced: boolean;
  syncJitterMaxS: number;
  syncBatchMax: number;
  apkDownloadUrl: string;
  initialPasswordTtlDays: number;
  webEntryRoles: string[];
  consentVersion: string;
  features: {
    webDataEntry: boolean;
  };
}

const DEFAULT_WEB_ENTRY_ROLES = ['cdc_secretary', 'sda', 'admin'];
const CONFIG_CACHE_TTL_MS = 10_000;

@Injectable()
export class AppConfigService {
  private cachedConfig: { value: AppConfig; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Returns current application configuration including sync pacing and version gates.
   */
  async getConfig(): Promise<AppConfig> {
    if (typeof this.prisma.appSetting?.findMany === 'function') {
      const now = Date.now();
      if (this.cachedConfig && now < this.cachedConfig.expiresAt) {
        return this.cachedConfig.value;
      }

      try {
        const keys = [
          'min_supported_version',
          'latest_version',
          'agent_can_edit_synced',
          'sync_jitter_max_s',
          'sync_batch_max',
          'apk_download_url',
          'initial_password_ttl_days',
          'web_data_entry_enabled',
          'web_entry_roles',
          'consent_version',
        ];
        const rows = await this.prisma.appSetting.findMany({
          where: { key: { in: keys } },
        });
        const map = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
        const config = this.buildConfigFromValues({
          min_supported_version: map.get('min_supported_version') ?? '1.0.0',
          latest_version: map.get('latest_version') ?? '1.0.0',
          agent_can_edit_synced: map.get('agent_can_edit_synced') ?? false,
          sync_jitter_max_s: map.get('sync_jitter_max_s') ?? 120,
          sync_batch_max: map.get('sync_batch_max') ?? 50,
          apk_download_url:
            map.get('apk_download_url') ??
            (process.env.APK_DOWNLOAD_URL || '/v1/releases/download'),
          initial_password_ttl_days: map.get('initial_password_ttl_days') ?? 30,
          web_data_entry_enabled: map.get('web_data_entry_enabled') ?? false,
          web_entry_roles:
            map.get('web_entry_roles') ?? DEFAULT_WEB_ENTRY_ROLES,
          consent_version: map.get('consent_version') ?? 'consent.v0',
        });
        this.cachedConfig = {
          value: config,
          expiresAt: now + CONFIG_CACHE_TTL_MS,
        };
        return config;
      } catch {
        return this.buildConfigFromValues({});
      }
    }

    const [
      minVerSetting,
      latestVerSetting,
      agentCanEditSetting,
      syncJitterSetting,
      syncBatchSetting,
      apkUrlSetting,
      ttlDaysSetting,
      webEntrySetting,
      webRolesSetting,
      consentVerSetting,
    ] = await Promise.all([
      this.getSetting<unknown>('min_supported_version', '1.0.0'),
      this.getSetting<unknown>('latest_version', '1.0.0'),
      this.getSetting<unknown>('agent_can_edit_synced', false),
      this.getSetting<unknown>('sync_jitter_max_s', 120),
      this.getSetting<unknown>('sync_batch_max', 50),
      this.getSetting<unknown>(
        'apk_download_url',
        process.env.APK_DOWNLOAD_URL || '/v1/releases/download',
      ),
      this.getSetting<unknown>('initial_password_ttl_days', 30),
      this.getSetting<unknown>('web_data_entry_enabled', false),
      this.getSetting<unknown>('web_entry_roles', DEFAULT_WEB_ENTRY_ROLES),
      this.getSetting<unknown>('consent_version', 'consent.v0'),
    ]);

    return this.buildConfigFromValues({
      min_supported_version: minVerSetting,
      latest_version: latestVerSetting,
      agent_can_edit_synced: agentCanEditSetting,
      sync_jitter_max_s: syncJitterSetting,
      sync_batch_max: syncBatchSetting,
      apk_download_url: apkUrlSetting,
      initial_password_ttl_days: ttlDaysSetting,
      web_data_entry_enabled: webEntrySetting,
      web_entry_roles: webRolesSetting,
      consent_version: consentVerSetting,
    });
  }

  private buildConfigFromValues(values: Record<string, unknown>): AppConfig {
    const webRolesSetting = values.web_entry_roles;
    const webEntryRoles = Array.isArray(webRolesSetting)
      ? webRolesSetting.map((role) => String(role))
      : DEFAULT_WEB_ENTRY_ROLES;
    const webEntrySetting = values.web_data_entry_enabled ?? false;

    const toNumberVal = (val: unknown, fallback: number): number =>
      val === undefined || val === null ? fallback : Number(val);

    return {
      minSupportedVersion: this.asString(values.min_supported_version, '1.0.0'),
      latestVersion: this.asString(values.latest_version, '1.0.0'),
      agentCanEditSynced: Boolean(values.agent_can_edit_synced ?? false),
      syncJitterMaxS: toNumberVal(values.sync_jitter_max_s, 120),
      syncBatchMax: toNumberVal(values.sync_batch_max, 50),
      apkDownloadUrl: this.asString(
        values.apk_download_url,
        process.env.APK_DOWNLOAD_URL || '/v1/releases/download',
      ),
      initialPasswordTtlDays: toNumberVal(values.initial_password_ttl_days, 30),
      webEntryRoles,
      consentVersion: this.asString(values.consent_version, 'consent.v0'),
      features: {
        webDataEntry:
          Boolean(webEntrySetting) || webEntryRoles.includes('super_admin'),
      },
    };
  }

  private asString(val: unknown, fallback: string): string {
    return typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
      ? String(val)
      : fallback;
  }

  /**
   * Returns current consent version string setting.
   */
  async getConsentVersion(): Promise<string> {
    const val = await this.getSetting<unknown>('consent_version', 'consent.v0');
    return this.asString(val, 'consent.v0');
  }

  /**
   * Helper to fetch setting from app_settings with fallback.
   */
  async getSetting<T = unknown>(key: string, defaultValue: T): Promise<T> {
    try {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key },
      });
      return setting ? (setting.value as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Updates an app setting (Super Admin only).
   */
  async updateSetting(
    key: string,
    value: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cachedConfig = null;
  }

  /**
   * Compares two semantic version strings (e.g. "1.2.3").
   * Returns:
   * -1 if v1 < v2
   *  0 if v1 === v2
   *  1 if v1 > v2
   */
  compareSemver(v1: string, v2: string): number {
    const p1 = v1.split('.').map((n) => parseInt(n, 10) || 0);
    const p2 = v2.split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] ?? 0;
      const num2 = p2[i] ?? 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }
}
