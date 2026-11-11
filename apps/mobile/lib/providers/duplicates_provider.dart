import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client_provider.dart';
import 'auth_provider.dart';
import 'connectivity_provider.dart';
import 'sync_provider.dart';

/// Incremented whenever a duplicate candidate is confirmed or dismissed so
/// badges across the app immediately refetch open counts.
final duplicatesRevisionProvider =
    StateNotifierProvider<DuplicatesRevisionNotifier, int>((ref) {
      return DuplicatesRevisionNotifier();
    });

class DuplicatesRevisionNotifier extends StateNotifier<int> {
  DuplicatesRevisionNotifier() : super(0);

  void increment() {
    state++;
  }
}

/// Fetches the current open duplicate count for Level 4 (`cdc_secretary`) and
/// `super_admin` users when online; gracefully returns `0` when offline or
/// unreachable so the home screen hub remains non-blocking.
final teamOpenDuplicatesCountProvider = FutureProvider<int>((ref) async {
  ref.watch(duplicatesRevisionProvider);
  ref.watch(recordsRevisionProvider);

  final isOnline = ref.watch(connectivityProvider);
  final authState = ref.watch(authProvider);
  final role = authState.profile?.role;

  if (!isOnline ||
      authState.status != AuthStatus.authenticated ||
      (role != 'cdc_secretary' && role != 'super_admin')) {
    return 0;
  }

  try {
    final apiClient = ref.read(apiClientProvider);
    final res = await apiClient.getDuplicates(status: 'open', limit: 1);
    final count = res['openCount'];
    if (count is num) {
      return count.toInt();
    }
    return 0;
  } catch (_) {
    return 0;
  }
});
