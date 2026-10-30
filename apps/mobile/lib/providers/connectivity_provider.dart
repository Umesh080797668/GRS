import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for real-time network connectivity.
/// Returns `true` if connected to mobile data or Wi-Fi, `false` if disconnected (airplane mode / data off).
final connectivityProvider = StateNotifierProvider<ConnectivityNotifier, bool>((
  ref,
) {
  return ConnectivityNotifier();
});

class ConnectivityNotifier extends StateNotifier<bool> {
  final Connectivity _connectivity;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  ConnectivityNotifier({Connectivity? connectivity})
    : _connectivity = connectivity ?? Connectivity(),
      super(true) {
    _init();
  }

  Future<void> _init() async {
    try {
      final results = await _connectivity.checkConnectivity();
      _updateStatus(results);
    } catch (_) {
      // Default to true if check fails initially
      state = true;
    }

    _subscription = _connectivity.onConnectivityChanged.listen(_updateStatus);
  }

  void _updateStatus(List<ConnectivityResult> results) {
    // If results is empty or only contains ConnectivityResult.none, we are offline!
    final isOnline =
        results.isNotEmpty &&
        results.any((result) => result != ConnectivityResult.none);
    state = isOnline;
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
