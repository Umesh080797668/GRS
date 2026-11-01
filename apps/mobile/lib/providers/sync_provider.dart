import 'dart:async';
import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'api_client_provider.dart';
import 'auth_provider.dart';
import 'config_provider.dart';
import 'connectivity_provider.dart';
import 'database_provider.dart';
import '../services/background_sync_service.dart';
import '../services/sync_engine.dart';

/// Calculates full jitter backoff duration per Build Plan §8.5 & AWS Architecture guidelines.
/// sleep = random(0, min(cap, base * 2^attempt))
Duration calculateFullJitterBackoff({
  required int attempt,
  int baseSeconds = 5,
  int capSeconds = 900, // 15 minutes cap
  math.Random? random,
}) => SyncEngine.calculateFullJitterBackoff(
  attempt: attempt,
  baseSeconds: baseSeconds,
  capSeconds: capSeconds,
  random: random,
);

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
      final delay = SyncEngine.calculatePacedDelay(
        maxJitterSeconds: config.syncJitterMaxS,
        random: random,
      );
      if (delay > Duration.zero) {
        await Future.delayed(delay);
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
      final rawClients = changes['clients'] as List<dynamic>? ?? [];

      final updatedHouseholdIds = <String>{};
      for (final h in rawHouseholds) {
        final household = Household.fromJson(h as Map<String, dynamic>);
        updatedHouseholdIds.add(household.id);
        await db.upsertHousehold(household);
        // Clear any previous HOUSE_DELETED / HOUSE_UNASSIGNED errors on clients for this household
        await db.clearHouseholdClientErrors(household.id);
      }

      if (rawDeleted.isNotEmpty) {
        final deletedIds = <String>{};
        final unassignedIds = <String>{};

        for (final d in rawDeleted) {
          final map = d as Map<String, dynamic>;
          final id = map['id'] as String;
          // Never delete a household that was actively updated / re-claimed
          if (updatedHouseholdIds.contains(id)) continue;

          final reason = map['deletedReason'] as String?;
          if (reason == 'unassigned_from_team') {
            unassignedIds.add(id);
          } else {
            deletedIds.add(id);
          }
        }

        if (deletedIds.isNotEmpty) {
          await db.handleDeletedHouseholds(deletedIds, reason: 'HOUSE_DELETED');
        }
        if (unassignedIds.isNotEmpty) {
          await db.handleDeletedHouseholds(
            unassignedIds,
            reason: 'HOUSE_UNASSIGNED',
          );
        }
      }

      for (final c in rawClients) {
        final clientMap = c as Map<String, dynamic>;
        final client = Client.fromJson(clientMap);
        await db.saveClient(
          client: client,
          status: SyncStatus.synced,
          baseVersion: clientMap['serverVersion'] as int? ?? 1,
        );
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

    try {
      final profile = _ref.read(authProvider).profile;
      final deviceId = 'mobile-${profile?.id ?? "agent"}';
      final apiClient = _ref.read(apiClientProvider);

      final result = await SyncEngine.executePushLoop(
        db: db,
        apiClient: apiClient,
        deviceId: deviceId,
        onBatchComplete: (_) {
          _ref.read(recordsRevisionProvider.notifier).increment();
        },
      );

      // Sync succeeded: reset backoff failure count
      _consecutiveFailures = 0;
      _retryAfterUntil = null;

      // Manage Workmanager background sync task (§8.5)
      if (result.remainingPendingCount > 0) {
        await BackgroundSyncService.scheduleSyncIfPending(
          pendingCount: result.remainingPendingCount,
          jitterMaxSeconds: 120,
        );
      } else {
        await BackgroundSyncService.cancel();
      }

      state = state.copyWith(
        isSyncing: false,
        pendingCount: result.remainingPendingCount,
        lastSyncTime: DateTime.now(),
        lastMessage: result.totalSynced > 0
            ? 'Synced ${result.totalSynced} record${result.totalSynced > 1 ? 's' : ''}${result.totalRejected > 0 ? ' (${result.totalRejected} rejected)' : ''}${result.totalFailed > 0 ? ' (${result.totalFailed} failed)' : ''}.'
            : (result.totalFailed > 0
                  ? '${result.totalFailed} record${result.totalFailed > 1 ? 's' : ''} failed. Will retry.'
                  : 'All records are up to date.'),
      );

      return true;
    } on GrsApiException catch (e) {
      _consecutiveFailures++;
      _ref.read(recordsRevisionProvider.notifier).increment();

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
      _ref.read(recordsRevisionProvider.notifier).increment();

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
