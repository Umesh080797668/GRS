import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/permission_service.dart';

class PermissionGateState {
  final bool isChecking;
  final bool isGranted;
  final bool isPermanentlyDenied;

  const PermissionGateState({
    this.isChecking = true,
    this.isGranted = false,
    this.isPermanentlyDenied = false,
  });

  PermissionGateState copyWith({
    bool? isChecking,
    bool? isGranted,
    bool? isPermanentlyDenied,
  }) {
    return PermissionGateState(
      isChecking: isChecking ?? this.isChecking,
      isGranted: isGranted ?? this.isGranted,
      isPermanentlyDenied: isPermanentlyDenied ?? this.isPermanentlyDenied,
    );
  }
}

class PermissionGateNotifier extends StateNotifier<PermissionGateState> {
  final PermissionService _service;

  PermissionGateNotifier(this._service) : super(const PermissionGateState()) {
    checkPermissions();
  }

  /// Evaluates whether required permissions are currently granted.
  Future<bool> checkPermissions() async {
    state = state.copyWith(isChecking: true);
    final granted = await _service.arePermissionsGranted();
    final permanentlyDenied = granted
        ? false
        : await _service.hasPermanentlyDeniedPermissions();

    state = state.copyWith(
      isChecking: false,
      isGranted: granted,
      isPermanentlyDenied: permanentlyDenied,
    );
    return granted;
  }

  /// Prompts the user for required permissions or navigates to Settings if permanently denied.
  Future<bool> requestPermissions() async {
    state = state.copyWith(isChecking: true);
    await _service.requestPermissions();
    return await checkPermissions();
  }

  Future<void> openSettings() async {
    await _service.openSettings();
  }

  void exitApp() {
    _service.exitApp();
  }
}

final permissionServiceProvider = Provider<PermissionService>((ref) {
  return const PermissionService();
});

final permissionGateProvider =
    StateNotifierProvider<PermissionGateNotifier, PermissionGateState>((ref) {
      final service = ref.watch(permissionServiceProvider);
      return PermissionGateNotifier(service);
    });
