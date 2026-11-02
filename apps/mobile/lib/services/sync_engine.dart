import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:grs_core/grs_core.dart';
import 'package:mobile/config/env.dart';
import '../data/local/database.dart';

/// Individual batch result summary.
class SyncBatchResult {
  final int synced;
  final int rejected;
  final int failed;
  final List<String> batchIds;

  const SyncBatchResult({
    this.synced = 0,
    this.rejected = 0,
    this.failed = 0,
    this.batchIds = const [],
  });
}

/// Execution summary of a full push loop run.
class SyncPushExecutionResult {
  final int totalSynced;
  final int totalRejected;
  final int totalFailed;
  final int remainingPendingCount;

  const SyncPushExecutionResult({
    this.totalSynced = 0,
    this.totalRejected = 0,
    this.totalFailed = 0,
    this.remainingPendingCount = 0,
  });
}

/// Unified, shared sync push engine implementing all Milestone 3 invariants
/// (Blueprint §8.2, §8.3, §8.5, §12.4):
///
/// 1. Shared execution between foreground (SyncNotifier) and background (BackgroundSyncService)
///    to eliminate code drift.
/// 2. Bounded batching (chunks of up to 50 records per request).
/// 3. Revision Guard (§8.2 #2): update to synced ONLY if local revision is unchanged.
/// 4. Canonical status handling:
///    - 'ok'       -> SyncStatus.synced
///    - 'locked'   -> SyncStatus.rejected (RECORD_LOCKED, Decision C2)
///    - 'rejected' / 'forbidden' -> SyncStatus.rejected (server rejection)
///    - 'stale'    -> SyncStatus.failed (RACE_CONFLICT concurrency collision)
///    - unknown    -> SyncStatus.failed (bounded retry, never tight-loops)
/// 5. Full jitter backoff and pacing calculations (§8.5).
class SyncEngine {
  /// Calculates full jitter backoff duration per Build Plan §8.5 & AWS Architecture guidelines.
  /// sleep = random(0, min(cap, base * 2^attempt))
  static Duration calculateFullJitterBackoff({
    required int attempt,
    int baseSeconds = 5,
    int capSeconds = 900, // 15 minutes cap
    math.Random? random,
  }) {
    final rnd = random ?? math.Random();
    final exp = math.pow(2, attempt).clamp(1, 1000).toInt();
    final temp = math.min(capSeconds, baseSeconds * exp);
    final sleepSeconds = rnd.nextInt(temp + 1);
    return Duration(seconds: math.max(1, sleepSeconds));
  }

  /// Calculates a random jitter delay in [0, maxJitterSeconds] for pacing reconnects (§8.5).
  /// Reconnecting phones spread arrivals evenly to avoid server thundering herds.
  static Duration calculatePacedDelay({
    required int maxJitterSeconds,
    math.Random? random,
  }) {
    if (maxJitterSeconds <= 0) return Duration.zero;
    final rnd = random ?? math.Random();
    final jitterSec = rnd.nextInt(maxJitterSeconds + 1);
    return Duration(seconds: jitterSec);
  }

  /// Maximum bisection depth to avoid request explosion during outages
  static const int maxBisectionDepth = 3;

  /// Determines if a 4xx error is systemic (e.g. forbidNonWhitelisted, 404, 413, or non-record code)
  static bool _isSystemic4xx(GrsApiException e) {
    if (e.statusCode == 404 || e.statusCode == 413 || e.statusCode == 415) {
      return true;
    }
    if (e.statusCode >= 400 && e.statusCode < 500) {
      final code = e.code.toUpperCase();
      final msg = e.messageKey.toLowerCase();
      if (code.contains('FORBID') ||
          code.contains('WHITELIST') ||
          msg.contains('forbidnonwhitelisted') ||
          msg.contains('whitelist') ||
          code == 'BAD_REQUEST') {
        return true;
      }
      if (!_isPerRecordValidationCode(e.code)) {
        return true;
      }
    }
    return false;
  }

  /// Checks if an error code represents an isolated per-record validation failure
  static bool _isPerRecordValidationCode(String code) {
    final upper = code.toUpperCase();
    return upper.startsWith('INVALID_') ||
        upper.startsWith('VALIDATION_') ||
        upper.contains('RECORD') ||
        upper == 'DUPLICATE_CLIENT' ||
        upper == 'FIELD_VALIDATION_FAILED';
  }

  /// Executes the core sync push loop across all pending records in batches of up to [batchSize].
  ///
  /// Used identically by foreground [SyncNotifier] and background [BackgroundSyncService].
  static Future<SyncPushExecutionResult> executePushLoop({
    required AppDatabase db,
    required GrsApiClient apiClient,
    required String deviceId,
    int batchSize = 50,
    void Function(SyncBatchResult batch)? onBatchComplete,
  }) async {
    final attemptedIds = <String>{};
    var totalSynced = 0;
    var totalRejected = 0;
    var totalFailed = 0;

    while (true) {
      final allPendingRows = await db.getPendingClientsBatch(limit: batchSize);
      final pendingRows = allPendingRows
          .where((r) => !attemptedIds.contains(r['id'] as String))
          .toList();

      if (pendingRows.isEmpty) {
        break;
      }

      final localRevisions = <String, int>{};
      for (final row in pendingRows) {
        final clientId = row['id'] as String;
        attemptedIds.add(clientId);
        final revision = (row['local_revision'] as int?) ?? 1;
        localRevisions[clientId] = revision;
      }

      Future<SyncPushResponse> sendPush(
        List<Map<String, dynamic>> batch,
      ) async {
        final payloads = _buildPayloads(batch);
        final completedHouses = await db.getHouseholds(
          statusFilter: 'completed',
        );
        final finishedHouseholdIds = completedHouses
            .map((h) => h['id'] as String)
            .toList();

        final request = SyncPushRequest(
          deviceId: deviceId,
          appVersion: AppEnv.appVersion,
          schemaVersion: AppDatabase.currentSchemaVersion,
          records: payloads,
          finishedHouseholdIds: finishedHouseholdIds,
        );
        return await apiClient.pushSync(request);
      }

      Future<void> processResponse(
        SyncPushResponse response,
        List<String> subBatchIds,
      ) async {
        var batchSynced = 0;
        var batchRejected = 0;
        var batchFailed = 0;

        for (final result in response.results) {
          final expectedRevision = localRevisions[result.id];

          if (result.status == 'ok') {
            final updated = await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.synced,
              baseVersion: result.serverVersion,
              expectedLocalRevision: expectedRevision,
            );
            if (updated) {
              batchSynced++;
            }
          } else if (result.status == 'locked') {
            batchRejected++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.rejected,
              errorCode:
                  result.code ??
                  'RECORD_LOCKED: Confirmed record cannot be edited by field agents (Decision C2)',
            );
          } else if (result.status == 'rejected' ||
              result.status == 'forbidden') {
            batchRejected++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.rejected,
              errorCode: result.code ?? 'REJECTED_BY_SERVER',
            );
          } else if (result.status == 'stale') {
            batchFailed++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.failed,
              errorCode: result.code ?? 'RACE_CONFLICT',
            );
          } else {
            batchFailed++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.failed,
              errorCode: result.code ?? 'UNKNOWN_STATUS_${result.status}',
            );
          }
        }

        totalSynced += batchSynced;
        totalRejected += batchRejected;
        totalFailed += batchFailed;

        onBatchComplete?.call(
          SyncBatchResult(
            synced: batchSynced,
            rejected: batchRejected,
            failed: batchFailed,
            batchIds: subBatchIds,
          ),
        );
      }

      Future<void> pushSubBatch(
        List<Map<String, dynamic>> subBatch, {
        int depth = 0,
      }) async {
        if (subBatch.isEmpty) return;

        final subBatchIds = subBatch.map((r) => r['id'] as String).toList();

        try {
          final response = await sendPush(subBatch);
          await processResponse(response, subBatchIds);
          return;
        } on GrsApiException catch (e) {
          // System-level responses: 426 (Version Gate), 401 (Auth/Deactivated), 429/503 (Pacing).
          // Do NOT bisect on these. They must rethrow so SyncNotifier / Auth can handle them.
          if (e.statusCode == 426 ||
              e.isVersionGate ||
              e.statusCode == 401 ||
              e.isAccountDeactivated ||
              e.statusCode == 429 ||
              e.statusCode == 503) {
            await db.markClientsFailed(subBatchIds, errorCode: e.code);
            rethrow;
          }

          // Systemic 4xx error (e.g. forbidNonWhitelisted, 404, 413, or non-record validation error):
          // Stop bisection and keep all records pending with a "Please update the app" message.
          if (_isSystemic4xx(e)) {
            await db.keepClientsPending(
              subBatchIds,
              message: 'Please update the app.',
            );
            rethrow;
          }

          // If single record or maximum bisection depth reached:
          if (subBatch.length <= 1 || depth >= maxBisectionDepth) {
            for (final record in subBatch) {
              final recordId = record['id'] as String;
              final retryCount = (record['retry_count'] as int?) ?? 0;

              if (e.statusCode >= 400 && e.statusCode < 500) {
                if (_isPerRecordValidationCode(e.code)) {
                  totalRejected++;
                  await db.updateClientSyncStatus(
                    recordId,
                    status: SyncStatus.rejected,
                    errorCode: '${e.code}: ${e.messageKey}',
                  );
                } else {
                  await db.keepClientsPending([
                    recordId,
                  ], message: 'Please update the app.');
                }
              } else {
                // 5xx server error
                if (retryCount + 1 >= 3) {
                  totalRejected++;
                  await db.updateClientSyncStatus(
                    recordId,
                    status: SyncStatus.rejected,
                    errorCode: 'SERVER_ERROR_RETRIES_EXCEEDED: ${e.code}',
                  );
                } else {
                  totalFailed++;
                  await db.markClientsFailed([recordId], errorCode: e.code);
                }
              }
            }
            return;
          }

          // Bisect (split in half) to isolate bad record
          final mid = subBatch.length ~/ 2;
          final left = subBatch.sublist(0, mid);
          final right = subBatch.sublist(mid);

          if (e.statusCode >= 500) {
            // Outage amplification guard:
            // Check if both sibling halves fail with 5xx. If so, abort immediately!
            GrsApiException? left5xx;
            SyncPushResponse? leftResp;
            try {
              leftResp = await sendPush(left);
            } on GrsApiException catch (leftErr) {
              if (leftErr.statusCode >= 500) {
                left5xx = leftErr;
              } else if (_isSystemic4xx(leftErr)) {
                await db.keepClientsPending(
                  left.map((r) => r['id'] as String).toList(),
                  message: 'Please update the app.',
                );
                rethrow;
              } else {
                await pushSubBatch(left, depth: depth + 1);
              }
            }

            if (leftResp != null) {
              await processResponse(
                leftResp,
                left.map((r) => r['id'] as String).toList(),
              );
              await pushSubBatch(right, depth: depth + 1);
              return;
            }

            if (left5xx != null) {
              // Left half failed with 5xx. Test the sibling right half!
              GrsApiException? right5xx;
              SyncPushResponse? rightResp;
              try {
                rightResp = await sendPush(right);
              } on GrsApiException catch (rightErr) {
                if (rightErr.statusCode >= 500) {
                  right5xx = rightErr;
                } else if (_isSystemic4xx(rightErr)) {
                  await db.keepClientsPending(
                    right.map((r) => r['id'] as String).toList(),
                    message: 'Please update the app.',
                  );
                  rethrow;
                } else {
                  await pushSubBatch(right, depth: depth + 1);
                }
              }

              if (right5xx != null) {
                // Sibling half ALSO failed with 5xx!
                // Abort immediately to prevent outage amplification.
                await db.markClientsFailed(subBatchIds, errorCode: e.code);
                rethrow;
              }

              if (rightResp != null) {
                await processResponse(
                  rightResp,
                  right.map((r) => r['id'] as String).toList(),
                );
              }

              // Sibling did not fail with 5xx. Isolate poison pill in left half.
              await pushSubBatch(left, depth: depth + 1);
              return;
            }
          } else {
            // 4xx validation error: bisect left then right
            await pushSubBatch(left, depth: depth + 1);
            await pushSubBatch(right, depth: depth + 1);
            return;
          }
        } catch (e) {
          // Network errors (SocketException, timeout, offline): mark failed and rethrow
          await db.markClientsFailed(subBatchIds, errorCode: 'NETWORK_ERROR');
          rethrow;
        }
      }

      await pushSubBatch(pendingRows);
    }

    final remaining = await db.getPendingClientsBatch(limit: 100);

    return SyncPushExecutionResult(
      totalSynced: totalSynced,
      totalRejected: totalRejected,
      totalFailed: totalFailed,
      remainingPendingCount: remaining.length,
    );
  }

  static List<SyncRecordPayload> _buildPayloads(
    List<Map<String, dynamic>> rows,
  ) {
    return rows.map((row) {
      final rawHopes = row['future_hopes'];
      List<dynamic> parsedHopes = [];
      if (rawHopes is String && rawHopes.isNotEmpty) {
        try {
          parsedHopes = jsonDecode(rawHopes) as List<dynamic>;
        } catch (_) {}
      } else if (rawHopes is List) {
        parsedHopes = rawHopes;
      }

      return SyncRecordPayload(
        id: row['id'] as String,
        baseVersion: (row['base_version'] as int?) ?? 0,
        clientUpdatedAt:
            DateTime.tryParse(row['client_updated_at'] as String? ?? '') ??
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
          'interested_vocational_stream': row['interested_vocational_stream'],
          'interested_job': row['interested_job'],
          'is_epf': (row['is_epf'] as int?) == 1,
          'is_etf': (row['is_etf'] as int?) == 1,
          'is_aswesuma': (row['is_aswesuma'] as int?) == 1,
          'is_samurdhi': (row['is_samurdhi'] as int?) == 1,
          'has_special_needs': (row['has_special_needs'] as int?) == 1,
          'future_hopes': parsedHopes,
          'info_provided_by': row['info_provided_by'],
          'info_provided_by_other': row['info_provided_by_other'],
          'consent_given': (row['consent_given'] as int?) == 1,
          'consent_at': row['consent_at'],
          'consent_version': row['consent_version'] ?? 'consent.v0',
        },
      );
    }).toList();
  }
}
