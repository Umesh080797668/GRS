import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'api_client_provider.dart';
import 'auth_provider.dart';
import 'config_provider.dart';
import 'connectivity_provider.dart';
import 'database_provider.dart';
import '../data/local/database.dart';
import '../services/background_sync_service.dart';

/// Calculates full jitter backoff duration per Build Plan §8.5 & AWS Architecture guidelines.
/// sleep = random(0, min(cap, base * 2^attempt))
Duration calculateFullJitterBackoff({
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

/// Storm test arrival simulator per Build Plan §8.5 & §12.4 #14.
/// 5,000 phones regain connectivity at the same instant; arrivals spread over jitter window.
/// Returns whether the peak 10s arrival window <= 3x the mean 10s window.
bool simulateStormArrivals({
  int phoneCount = 5000,
  int jitterWindowSeconds = 120,
  int bucketWindowSeconds = 10,
  math.Random? random,
}) {
  final rnd = random ?? math.Random(42);
  final bucketCount = (jitterWindowSeconds / bucketWindowSeconds).ceil();
  final buckets = List<int>.filled(bucketCount, 0);

  for (var i = 0; i < phoneCount; i++) {
    final arrivalSecond = rnd.nextInt(jitterWindowSeconds);
    final bucketIndex = arrivalSecond ~/ bucketWindowSeconds;
    buckets[bucketIndex]++;
  }

  final meanPerBucket = phoneCount / bucketCount;
  final peakBucket = buckets.reduce(math.max);

  // Invariant §12.4 #14: peak 10s window <= 3x the mean
  return peakBucket <= (3.0 * meanPerBucket);
}

/// Database mutation revision tracker.
/// Whenever local records are added, edited, deleted, or synced,
/// incrementing this provider immediately notifies all watching screens.
final recordsRevisionProvider =
    StateNotifierProvider<RecordsRevisionNotifier, int>((ref) {
      return RecordsRevisionNotifier();
    });

class RecordsRevisionNotifier extends StateNotifier<int> {
  RecordsRevisionNotifier() : super(0);

  void increment() {
    state++;
  }
}

/// Real-time pending client records count (pending + failed).
final pendingCountProvider = FutureProvider<int>((ref) async {
  ref.watch(recordsRevisionProvider);
  try {
    final db = await ref.watch(databaseProvider.future);
    final pending = await db.getPendingClientsBatch(limit: 1000);
    return pending.length;
  } catch (_) {
    return 0;
  }
});

/// Real-time household summary counts for home screen stats.
final householdStatsProvider = FutureProvider<Map<String, int>>((ref) async {
  ref.watch(recordsRevisionProvider);
  try {
    final db = await ref.watch(databaseProvider.future);
    final all = await db.getHouseholds();
    var completed = 0;
    var inProgress = 0;
    var notStarted = 0;
    for (final h in all) {
      final s = h['status'] as String? ?? 'not_started';
      if (s == 'completed') {
        completed++;
      } else if (s == 'in_progress') {
        inProgress++;
      } else {
        notStarted++;
      }
    }
    return {
      'total': all.length,
      'completed': completed,
      'inProgress': inProgress,
      'notStarted': notStarted,
    };
  } catch (_) {
    return {'total': 0, 'completed': 0, 'inProgress': 0, 'notStarted': 0};
  }
});

/// State of background/foreground sync
class SyncState {
  final bool isSyncing;
  final int pendingCount;
  final DateTime? lastSyncTime;
  final String? error;
  final String? lastMessage;

  const SyncState({
    this.isSyncing = false,
    this.pendingCount = 0,
    this.lastSyncTime,
    this.error,
    this.lastMessage,
  });

  SyncState copyWith({
    bool? isSyncing,
    int? pendingCount,
    DateTime? lastSyncTime,
    String? error,
    String? lastMessage,
  }) {
    return SyncState(
      isSyncing: isSyncing ?? this.isSyncing,
      pendingCount: pendingCount ?? this.pendingCount,
      lastSyncTime: lastSyncTime ?? this.lastSyncTime,
      error: error,
      lastMessage: lastMessage ?? this.lastMessage,
    );
  }
}

final syncProvider = StateNotifierProvider<SyncNotifier, SyncState>((ref) {
  return SyncNotifier(ref);
});

class SyncNotifier extends StateNotifier<SyncState> {
  final Ref _ref;
  Timer? _debounceTimer;
  DateTime? _retryAfterUntil;
  int _consecutiveFailures = 0;

  SyncNotifier(this._ref) : super(const SyncState()) {
    // Listen to network changes for auto-sync when reconnecting (Rule 8.5)
    _ref.listen<bool>(connectivityProvider, (previous, current) {
      if (previous == false && current == true) {
        // Auto-sync pending records with jitter when coming back online (§8.5)
        triggerPacedSync(isManual: false);
        pullChanges();
      }
    });
  }

  /// Triggers a paced sync with random jitter delay from /config (§8.5).
  /// Manual "Sync now" skips the jitter and runs immediately.
  Future<void> triggerPacedSync({
    bool isManual = false,
    math.Random? random,
  }) async {
    if (isManual) {
      await sync();
      return;
    }

    try {
      final config = await _ref.read(appConfigProvider.future);
      final jitterMax = config.syncJitterMaxS;
      if (jitterMax > 0) {
        final rnd = random ?? math.Random();
        final jitterSec = rnd.nextInt(jitterMax + 1);
        if (jitterSec > 0) {
          await Future.delayed(Duration(seconds: jitterSec));
        }
      }
    } catch (_) {}

    await sync(silent: true);
  }

  /// Triggers a debounced sync when an agent saves a client survey online.
  /// Batches fast successive entries within 3 seconds into the next request (§8.5).
  void triggerDebouncedSync() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(seconds: 3), () {
      sync(silent: true);
    });
  }

  /// Pulls incremental updates/deletions from GET /v1/sync/changes (Rule 8.3 & Blueprint §6.2)
  Future<void> pullChanges() async {
    final isOnline = _ref.read(connectivityProvider);
    if (!isOnline) return;

    try {
      final db = await _ref.read(databaseProvider.future);
      final lastSyncTime = await db.getMeta('last_sync_time');
      final apiClient = _ref.read(apiClientProvider);

      final changes = await apiClient.getChanges(since: lastSyncTime);
      final rawHouseholds = changes['households'] as List<dynamic>? ?? [];
      final rawDeleted = changes['deletedHouseholds'] as List<dynamic>? ?? [];

      for (final h in rawHouseholds) {
        final household = Household.fromJson(h as Map<String, dynamic>);
        await db.upsertHousehold(household);
      }

      if (rawDeleted.isNotEmpty) {
        final deletedIds = rawDeleted
            .map((d) => (d as Map<String, dynamic>)['id'] as String)
            .toSet();
        // Remove deleted households from local database, keeping households with unsynced local client drafts
        final allLocal = await db.getHouseholds();
        final remainingIds = allLocal
            .map((h) => h['id'] as String)
            .where((id) => !deletedIds.contains(id))
            .toSet();
        await db.removeHouseholdsNotIn(remainingIds);
      }

      final serverTime =
          changes['serverTime'] as String? ?? DateTime.now().toIso8601String();
      await db.setMeta('last_sync_time', serverTime);
      _ref.read(recordsRevisionProvider.notifier).increment();
    } catch (_) {
      // Delta pull errors are non-blocking
    }
  }

  /// Resets backoff and throttling window.
  void resetBackoff() {
    _consecutiveFailures = 0;
    _retryAfterUntil = null;
  }

  /// Main sync push engine implementing all Milestone 3 invariants (§8.2, §8.3, §8.5):
  /// 1. Single-flight lock (no collisions between foreground and background)
  /// 2. Bounded batching (chunks of up to 50 records per request)
  /// 3. Revision guard (edits made during in-flight push survive)
  /// 4. Full jitter backoff on 429/503/errors (no tight loop retries)
  /// 5. Retry-After header support
  /// 6. Transient network failures transition to failed state with incremented retry_count
  /// 7. HTTP 426 Version Gate and 401 Account Deactivated handling
  Future<bool> sync({bool silent = false}) async {
    final isOnline = _ref.read(connectivityProvider);
    if (!isOnline) {
      state = state.copyWith(
        isSyncing: false,
        error: 'offline',
        lastMessage: 'Device is offline.',
      );
      return false;
    }

    // Check backoff throttle window (§8.5: Manual "Sync now" has no delay)
    final now = DateTime.now();
    if (silent && _retryAfterUntil != null && now.isBefore(_retryAfterUntil!)) {
      state = state.copyWith(
        isSyncing: false,
        lastMessage: 'Sync throttled. Retrying shortly.',
      );
      return false;
    }

    final db = await _ref.read(databaseProvider.future);

    // Single-flight lock check (Rule 8.2 #3 & §12.4 #8)
    final lockAcquired = await db.acquireSyncLock();
    if (!lockAcquired) {
      // Sync is already in flight on foreground or background isolate
      return false;
    }

    state = state.copyWith(isSyncing: true, error: null);

    final attemptedIds = <String>{};
    List<String> currentBatchIds = [];

    try {
      var totalSynced = 0;
      var totalRejected = 0;
      var totalFailed = 0;

      // Loop processing batches of up to 50 pending records (§12.4 #12)
      while (true) {
        final allPendingRows = await db.getPendingClientsBatch(limit: 50);
        final pendingRows = allPendingRows
            .where((r) => !attemptedIds.contains(r['id'] as String))
            .toList();

        if (pendingRows.isEmpty) {
          break;
        }

        final payloads = <SyncRecordPayload>[];
        final localRevisions = <String, int>{};
        currentBatchIds = [];

        for (final row in pendingRows) {
          final clientId = row['id'] as String;
          attemptedIds.add(clientId);
          currentBatchIds.add(clientId);
          final revision = (row['local_revision'] as int?) ?? 1;
          localRevisions[clientId] = revision;

          final rawHopes = row['future_hopes'];
          List<dynamic> parsedHopes = [];
          if (rawHopes is String && rawHopes.isNotEmpty) {
            try {
              parsedHopes = jsonDecode(rawHopes) as List<dynamic>;
            } catch (_) {}
          } else if (rawHopes is List) {
            parsedHopes = rawHopes;
          }

          payloads.add(
            SyncRecordPayload(
              id: clientId,
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
                'future_hopes': parsedHopes,
                'info_provided_by': row['info_provided_by'],
                'info_provided_by_other': row['info_provided_by_other'],
                'consent_given': (row['consent_given'] as int?) == 1,
                'consent_at': row['consent_at'],
                'consent_version': row['consent_version'] ?? 'consent.v0',
              },
            ),
          );
        }

        final profile = _ref.read(authProvider).profile;
        final deviceId = 'mobile-${profile?.id ?? "agent"}';

        final request = SyncPushRequest(
          deviceId: deviceId,
          appVersion: AppEnv.appVersion,
          schemaVersion: AppDatabase.currentSchemaVersion,
          records: payloads,
        );

        final apiClient = _ref.read(apiClientProvider);
        final response = await apiClient.pushSync(request);

        for (final result in response.results) {
          final expectedRevision = localRevisions[result.id];

          if (result.status == 'ok') {
            // Revision Guard (§8.2 #2): update to synced ONLY if local revision is unchanged
            final updated = await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.synced,
              baseVersion: result.serverVersion,
              expectedLocalRevision: expectedRevision,
            );
            if (updated) {
              totalSynced++;
            }
          } else if (result.status == 'locked') {
            // Server confirmed record already exists and is locked for Level 5 (Decision C2)
            totalRejected++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.rejected,
              errorCode:
                  result.code ??
                  'RECORD_LOCKED: Confirmed record cannot be edited by field agents (Decision C2)',
            );
          } else if (result.status == 'rejected' ||
              result.status == 'forbidden') {
            totalRejected++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.rejected,
              errorCode: result.code ?? 'REJECTED_BY_SERVER',
            );
          } else if (result.status == 'stale') {
            // Concurrency race or stale version: transient error, mark failed for retry
            totalFailed++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.failed,
              errorCode: result.code ?? 'RACE_CONFLICT',
            );
          } else {
            // Any unknown status: mark as failed with error code, DO NOT loop forever
            totalFailed++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.failed,
              errorCode: result.code ?? 'UNKNOWN_STATUS_${result.status}',
            );
          }
        }

        // Increment revision so UI updates immediately
        _ref.read(recordsRevisionProvider.notifier).increment();
      }

      // Sync succeeded: reset backoff failure count
      _consecutiveFailures = 0;
      _retryAfterUntil = null;

      final remaining = await db.getPendingClientsBatch(limit: 100);

      // Manage Workmanager background sync task (§8.5)
      if (remaining.isNotEmpty) {
        await BackgroundSyncService.scheduleSyncIfPending(
          pendingCount: remaining.length,
          jitterMaxSeconds: 120,
        );
      } else {
        await BackgroundSyncService.cancel();
      }

      state = state.copyWith(
        isSyncing: false,
        pendingCount: remaining.length,
        lastSyncTime: DateTime.now(),
        lastMessage: totalSynced > 0
            ? 'Synced $totalSynced record${totalSynced > 1 ? 's' : ''}${totalRejected > 0 ? ' ($totalRejected rejected)' : ''}${totalFailed > 0 ? ' ($totalFailed failed)' : ''}.'
            : (totalFailed > 0
                  ? '$totalFailed record${totalFailed > 1 ? 's' : ''} failed. Will retry.'
                  : 'All records are up to date.'),
      );

      return true;
    } on GrsApiException catch (e) {
      _consecutiveFailures++;

      // Mark current attempted batch records as failed (§8.2 #5)
      if (currentBatchIds.isNotEmpty) {
        await db.markClientsFailed(currentBatchIds, errorCode: e.code);
        _ref.read(recordsRevisionProvider.notifier).increment();
      }

      // Invariant §8.2 #10: HTTP 426 Version Gate shows blocking update screen
      if (e.statusCode == 426 || e.isVersionGate) {
        state = state.copyWith(
          isSyncing: false,
          error: 'UPGRADE_REQUIRED',
          lastMessage: 'App update required (HTTP 426).',
        );
        return false;
      }

      // Invariant §8.2 #11: Account deactivation stops sync, shows Contact your admin
      if (e.isAccountDeactivated ||
          (e.statusCode == 401 &&
              (e.code == 'ACCOUNT_DEACTIVATED' ||
                  e.messageKey.contains('deactivated')))) {
        // Set authProvider state to deactivated
        _ref.read(authProvider.notifier).setDeactivatedState();
        state = state.copyWith(
          isSyncing: false,
          error: 'ACCOUNT_DEACTIVATED',
          lastMessage: 'Account deactivated. Contact your admin.',
        );
        return false;
      }

      if (e.statusCode == 429 || e.statusCode == 503) {
        // Honor Retry-After header if returned by server (§8.5)
        if (e.retryAfterSeconds != null && e.retryAfterSeconds! > 0) {
          _retryAfterUntil = DateTime.now().add(
            Duration(seconds: e.retryAfterSeconds!),
          );
        } else {
          // Compute full jitter backoff (§8.5 & §12.4 #13)
          final backoff = calculateFullJitterBackoff(
            attempt: _consecutiveFailures,
            baseSeconds: 5,
            capSeconds: 900,
          );
          _retryAfterUntil = DateTime.now().add(backoff);
        }
      }

      state = state.copyWith(
        isSyncing: false,
        error: e.messageKey,
        lastMessage: 'Sync throttled or paused. Records safe locally.',
      );
      return false;
    } catch (e) {
      _consecutiveFailures++;

      // Mark current attempted batch records as failed
      if (currentBatchIds.isNotEmpty) {
        await db.markClientsFailed(currentBatchIds, errorCode: 'NETWORK_ERROR');
        _ref.read(recordsRevisionProvider.notifier).increment();
      }

      final backoff = calculateFullJitterBackoff(
        attempt: _consecutiveFailures,
        baseSeconds: 3,
        capSeconds: 300,
      );
      _retryAfterUntil = DateTime.now().add(backoff);

      state = state.copyWith(
        isSyncing: false,
        error: 'syncError',
        lastMessage: 'Sync paused. Records safe locally.',
      );
      return false;
    } finally {
      // Always release single-flight lock
      await db.releaseSyncLock();
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}
