import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'api_client_provider.dart';
import 'database_provider.dart';

/// Provider caching AppConfigModel from GET /v1/config with offline SQLite fallback.
final appConfigProvider = FutureProvider<AppConfigModel>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final db = await ref.watch(databaseProvider.future);

  try {
    final config = await apiClient.getConfig();
    // Cache settings in local database meta table
    await db.setMeta(
      'agent_can_edit_synced',
      config.agentCanEditSynced ? 'true' : 'false',
    );
    await db.setMeta('min_supported_version', config.minSupportedVersion);
    await db.setMeta('consent_version', config.consentVersion);
    await db.setMeta('lookup_version', config.lookupVersion);
    await db.setMeta('sync_jitter_max_s', config.syncJitterMaxS.toString());
    await db.setMeta('sync_batch_max', config.syncBatchMax.toString());
    return config;
  } catch (_) {
    // Offline / fallback from local SQLite meta
    final canEdit = await db.getMeta('agent_can_edit_synced');
    final minVer = await db.getMeta('min_supported_version');
    final consentVer = await db.getMeta('consent_version');
    final lookupVer = await db.getMeta('lookup_version');
    final jitter = await db.getMeta('sync_jitter_max_s');
    final batch = await db.getMeta('sync_batch_max');

    return AppConfigModel(
      minSupportedVersion: minVer ?? '1.0.0',
      agentCanEditSynced: canEdit == 'true',
      consentVersion: consentVer ?? 'consent.v0',
      lookupVersion: lookupVer ?? 'v1',
      syncJitterMaxS: int.tryParse(jitter ?? '') ?? 30,
      syncBatchMax: int.tryParse(batch ?? '') ?? 50,
    );
  }
});

/// Direct boolean provider for Decision C2 (whether agents can edit synced records)
final agentCanEditSyncedProvider = FutureProvider<bool>((ref) async {
  final config = await ref.watch(appConfigProvider.future);
  return config.agentCanEditSynced;
});
