import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AppConfig {
  minSupportedVersion: string;
  latestVersion: string;
  agentCanEditSynced: boolean;
  syncJitterMaxS: number;
  syncBatchMax: number;
  apkDownloadUrl: string;
  initialPasswordTtlDays: number;
  features: {
    webDataEntry: boolean;
  };
}

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns current application configuration including sync pacing and version gates.
   */
  async getConfig(): Promise<AppConfig> {
    const minVerSetting = await this.getSetting(
      'min_supported_version',
      '1.0.0',
    );
    const latestVerSetting = await this.getSetting('latest_version', '1.0.0');
    const agentCanEditSetting = await this.getSetting(
      'agent_can_edit_synced',
      false,
    );
    const syncJitterSetting = await this.getSetting('sync_jitter_max_s', 15);
    const syncBatchSetting = await this.getSetting('sync_batch_max', 50);
    const apkUrlSetting = await this.getSetting(
      'apk_download_url',
      'https://github.com/Umesh080797668/GRS/releases/latest/download/app-release.apk',
    );
    const ttlDaysSetting = await this.getSetting(
      'initial_password_ttl_days',
      30,
    );
    const webEntrySetting = await this.getSetting(
      'web_data_entry_enabled',
      false,
    );

    return {
      minSupportedVersion: String(minVerSetting),
      latestVersion: String(latestVerSetting),
      agentCanEditSynced: Boolean(agentCanEditSetting),
      syncJitterMaxS: Number(syncJitterSetting),
      syncBatchMax: Number(syncBatchSetting),
      apkDownloadUrl: String(apkUrlSetting),
      initialPasswordTtlDays: Number(ttlDaysSetting),
      features: {
        webDataEntry: Boolean(webEntrySetting),
      },
    };
  }

  /**
   * Helper to fetch setting from app_settings with fallback.
   */
  async getSetting(key: string, defaultValue: any): Promise<any> {
    try {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key },
      });
      return setting ? setting.value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Updates an app setting (Super Admin only).
   */
  async updateSetting(key: string, value: any): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
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
