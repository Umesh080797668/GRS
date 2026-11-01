import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/config/api_endpoint_resolver.dart';
import 'package:mobile/config/env.dart';
import 'package:path_provider/path_provider.dart';
import 'package:workmanager/workmanager.dart';
import '../data/local/database.dart';
import '../data/local/secure_storage_service.dart';

const String kBackgroundSyncTask = 'lk.gov.grs.sync_pending_task';

/// Background isolate callback dispatcher per Build Plan §8.2 #3 & §8.5.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    if (taskName == kBackgroundSyncTask) {
      try {
        final storage = SecureStorageService();
        final profile = await storage.getActiveProfile();
        if (profile == null) return true;

        final cipherKey = await storage.getDatabaseKey(userId: profile.id);
        if (cipherKey == null) return true;

        final appDocDir = await getApplicationDocumentsDirectory();
        final dbFile = File('${appDocDir.path}/grs_offline_${profile.id}.db');
        if (!await dbFile.exists()) return true;

        final db = await AppDatabase.open(file: dbFile, cipherKey: cipherKey);

        // Single-flight lock (Rule 8.2 #3 & §8.5)
        final lockAcquired = await db.acquireSyncLock();
        if (!lockAcquired) {
          await db.close();
          return true; // Already syncing in foreground
        }

        try {
          final pendingRows = await db.getPendingClientsBatch(limit: 50);
          if (pendingRows.isEmpty) {
            await db.releaseSyncLock();
            await db.close();
            return true;
          }

          final token = await storage.getAccessToken();
          final baseUrl =
              await storage.getApiBaseUrl() ??
              ApiEndpointResolver.resolveDefault();
          final apiClient = GrsApiClient(
            baseUrl: baseUrl,
            appVersion: AppEnv.appVersion,
            accessToken: token,
          );

          final payloads = <SyncRecordPayload>[];
          for (final row in pendingRows) {
            payloads.add(
              SyncRecordPayload(
                id: row['id'] as String,
                baseVersion: (row['base_version'] as int?) ?? 0,
                clientUpdatedAt:
                    DateTime.tryParse(
                      row['client_updated_at'] as String? ?? '',
                    ) ??
                    DateTime.now(),
                data: {
                  'household_id': row['household_id'],
                  'name': row['name'],
                  'age': row['age'],
                  'gender': row['gender'],
                  'address': row['address'],
                  'phone_raw': row['phone_raw'],
                  'phone_e164': row['phone_e164'],
                  'whatsapp_raw': row['whatsapp_raw'],
                  'whatsapp_e164': row['whatsapp_e164'],
                  'highest_education': row['highest_education'],
                  'highest_vocational': row['highest_vocational'],
                  'interested_vocational_stream':
                      row['interested_vocational_stream'],
                  'interested_job': row['interested_job'],
                  'is_epf': (row['is_epf'] as int?) == 1,
                  'is_etf': (row['is_etf'] as int?) == 1,
                  'is_aswesuma': (row['is_aswesuma'] as int?) == 1,
                  'is_samurdhi': (row['is_samurdhi'] as int?) == 1,
                  'has_special_needs': (row['has_special_needs'] as int?) == 1,
                  'future_hopes': row['future_hopes'],
                  'info_provided_by': row['info_provided_by'],
                  'info_provided_by_other': row['info_provided_by_other'],
                  'consent_given': (row['consent_given'] as int?) == 1,
                  'consent_at': row['consent_at'],
                  'consent_version': row['consent_version'] ?? 'consent.v0',
                },
              ),
            );
          }

          final request = SyncPushRequest(
            deviceId: 'mobile-${profile.id}',
            appVersion: AppEnv.appVersion,
            schemaVersion: AppDatabase.currentSchemaVersion,
            records: payloads,
          );

          final response = await apiClient.pushSync(request);
          for (final res in response.results) {
            if (res.status == 'ok') {
              await db.updateClientSyncStatus(
                res.id,
                status: SyncStatus.synced,
                baseVersion: res.serverVersion,
              );
            } else if (res.status == 'locked') {
              await db.updateClientSyncStatus(
                res.id,
                status: SyncStatus.rejected,
                errorCode: 'RECORD_LOCKED',
              );
            } else if (res.status == 'rejected' || res.status == 'forbidden') {
              await db.updateClientSyncStatus(
                res.id,
                status: SyncStatus.rejected,
                errorCode: res.code ?? 'REJECTED',
              );
            } else {
              await db.updateClientSyncStatus(
                res.id,
                status: SyncStatus.failed,
                errorCode: res.code ?? 'FAILED',
              );
            }
          }
        } finally {
          await db.releaseSyncLock();
          await db.close();
        }
      } catch (e) {
        debugPrint('Background sync task failed: $e');
      }
    }
    return Future.value(true);
  });
}

/// Service managing background WorkManager tasks per §8.5:
/// - One-off task only while pending > 0
/// - Cancelled when pending reaches 0
/// - Random jitter delay (0...sync_jitter_max_s)
class BackgroundSyncService {
  static bool _initialized = false;

  /// Initializes the WorkManager plugin on mobile platforms.
  static Future<void> initialize() async {
    if (_initialized) return;
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS)) {
      return;
    }
    try {
      await Workmanager().initialize(callbackDispatcher);
      _initialized = true;
    } catch (e) {
      debugPrint('Workmanager initialize failed (ignorable in tests): $e');
    }
  }

  /// Schedules a one-off background sync task ONLY when pending > 0 (§8.5).
  static Future<void> scheduleSyncIfPending({
    required int pendingCount,
    int jitterMaxSeconds = 120,
    Random? random,
  }) async {
    if (pendingCount <= 0) {
      await cancel();
      return;
    }
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS)) {
      return;
    }

    try {
      final rnd = random ?? Random();
      final jitterSec = jitterMaxSeconds > 0
          ? rnd.nextInt(jitterMaxSeconds + 1)
          : 0;

      await Workmanager().registerOneOffTask(
        kBackgroundSyncTask,
        kBackgroundSyncTask,
        initialDelay: Duration(seconds: jitterSec),
        constraints: Constraints(networkType: NetworkType.connected),
        existingWorkPolicy: ExistingWorkPolicy.replace,
      );
    } catch (e) {
      debugPrint('Schedule background sync failed: $e');
    }
  }

  /// Cancels any scheduled background sync task when pending count reaches 0 (§8.5).
  static Future<void> cancel() async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS)) {
      return;
    }
    try {
      await Workmanager().cancelByUniqueName(kBackgroundSyncTask);
    } catch (e) {
      debugPrint('Cancel background sync failed: $e');
    }
  }
}
