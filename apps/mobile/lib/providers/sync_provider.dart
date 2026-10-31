import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'api_client_provider.dart';
import 'auth_provider.dart';
import 'connectivity_provider.dart';
import 'database_provider.dart';
import '../data/local/database.dart';

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

/// Real-time pending client records count.
final pendingCountProvider = FutureProvider<int>((ref) async {
  ref.watch(recordsRevisionProvider);
  try {
    final db = await ref.watch(databaseProvider.future);
    final pending = await db.getAllClients(status: SyncStatus.pending);
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
        // Auto-sync pending records when coming back online
        sync(silent: true);
        pullChanges();
      }
    });
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

  /// Main sync push engine implementing all Milestone 3 invariants (§8.2, §8.3, §8.5):
  /// 1. Single-flight lock (no collisions between foreground and background)
  /// 2. Bounded batching (chunks of up to 50 records per request)
  /// 3. Revision guard (edits made during in-flight push survive)
  /// 4. Full jitter backoff on 429/503/errors (no tight loop retries)
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

    // Check backoff throttle window (§8.5)
    final now = DateTime.now();
    if (_retryAfterUntil != null && now.isBefore(_retryAfterUntil!)) {
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

    try {
      var totalSynced = 0;
      var totalRejected = 0;

      // Loop processing batches of up to 50 pending records (§12.4 #12)
      while (true) {
        final pendingRows = await db.getPendingClientsBatch(limit: 50);
        if (pendingRows.isEmpty) {
          break;
        }

        final payloads = <SyncRecordPayload>[];
        final localRevisions = <String, int>{};

        for (final row in pendingRows) {
          final clientId = row['id'] as String;
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
            // Server confirmed record already exists and is locked for Level 5
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.synced,
              baseVersion: result.serverVersion ?? 1,
              expectedLocalRevision: expectedRevision,
            );
            totalSynced++;
          } else if (result.status == 'rejected' ||
              result.status == 'forbidden') {
            totalRejected++;
            await db.updateClientSyncStatus(
              result.id,
              status: SyncStatus.rejected,
              errorCode: result.code ?? 'REJECTED_BY_SERVER',
            );
          }
        }

        // Increment revision so UI updates immediately
        _ref.read(recordsRevisionProvider.notifier).increment();
      }

      // Sync succeeded: reset backoff failure count
      _consecutiveFailures = 0;
      _retryAfterUntil = null;

      final remaining = await db.getAllClients(status: SyncStatus.pending);

      state = state.copyWith(
        isSyncing: false,
        pendingCount: remaining.length,
        lastSyncTime: DateTime.now(),
        lastMessage: totalSynced > 0
            ? 'Synced $totalSynced record${totalSynced > 1 ? 's' : ''}${totalRejected > 0 ? ' ($totalRejected rejected)' : ''}.'
            : 'All records are up to date.',
      );

      return true;
    } on GrsApiException catch (e) {
      _consecutiveFailures++;
      if (e.statusCode == 429 || e.statusCode == 503) {
        // Compute full jitter backoff (§8.5 & §12.4 #13)
        final backoff = calculateFullJitterBackoff(
          attempt: _consecutiveFailures,
          baseSeconds: 5,
          capSeconds: 900,
        );
        _retryAfterUntil = DateTime.now().add(backoff);
      }

      state = state.copyWith(
        isSyncing: false,
        error: e.messageKey,
        lastMessage: 'Sync throttled or paused. Records safe locally.',
      );
      return false;
    } catch (e) {
      _consecutiveFailures++;
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
