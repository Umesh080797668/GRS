import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'api_client_provider.dart';
import 'auth_provider.dart';
import 'connectivity_provider.dart';
import 'database_provider.dart';
import '../data/local/database.dart';

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
  // Watch revision so any mutation immediately recomputes pending count
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

  SyncNotifier(this._ref) : super(const SyncState()) {
    // Listen to network changes for auto-sync when reconnecting
    _ref.listen<bool>(connectivityProvider, (previous, current) {
      if (previous == false && current == true) {
        // Auto-sync pending records when coming back online
        sync(silent: true);
      }
    });
  }

  /// Triggers a sync push of all local pending records to the server
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

    state = state.copyWith(isSyncing: true, error: null);

    try {
      final db = await _ref.read(databaseProvider.future);
      final pendingRows = await db.getAllClients(status: SyncStatus.pending);

      if (pendingRows.isEmpty) {
        state = state.copyWith(
          isSyncing: false,
          pendingCount: 0,
          lastSyncTime: DateTime.now(),
          lastMessage: 'All records are up to date.',
        );
        return true;
      }

      // Convert local database rows to SyncRecordPayload models
      final payloads = <SyncRecordPayload>[];
      for (final row in pendingRows) {
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

      var syncedCount = 0;
      var rejectedCount = 0;

      for (final result in response.results) {
        if (result.status == 'ok') {
          syncedCount++;
          await db.updateClientSyncStatus(
            result.id,
            status: SyncStatus.synced,
            baseVersion: result.serverVersion,
          );
        } else if (result.status == 'rejected') {
          rejectedCount++;
          await db.updateClientSyncStatus(
            result.id,
            status: SyncStatus.rejected,
            errorCode: result.code ?? 'REJECTED_BY_SERVER',
          );
        }
      }

      // Refresh revision so all screens reflect new statuses immediately
      _ref.read(recordsRevisionProvider.notifier).increment();

      final remaining = await db.getAllClients(status: SyncStatus.pending);

      state = state.copyWith(
        isSyncing: false,
        pendingCount: remaining.length,
        lastSyncTime: DateTime.now(),
        lastMessage: syncedCount > 0
            ? 'Synced $syncedCount record${syncedCount > 1 ? 's' : ''}${rejectedCount > 0 ? ' ($rejectedCount rejected)' : ''}.'
            : 'Sync completed.',
      );

      return true;
    } catch (e) {
      state = state.copyWith(
        isSyncing: false,
        error: e.toString(),
        lastMessage: 'Sync paused. Records saved safely locally.',
      );
      return false;
    }
  }
}
