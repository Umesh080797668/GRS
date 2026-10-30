import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:permission_handler/permission_handler.dart';

/// Service managing app-required runtime permissions.
class PermissionService {
  const PermissionService();

  /// App-related required runtime permissions.
  /// On Android 13+ (API 33+), [Permission.notification] is the essential runtime permission
  /// for background sync status, conflict alerts, and OTA update notifications.
  List<Permission> get requiredPermissions => const [Permission.notification];

  /// Checks if all required permissions are granted.
  /// Returns `true` in test environments to keep widget tests isolated.
  Future<bool> arePermissionsGranted() async {
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains(
      'Test',
    );
    if (isTest || kIsWeb) return true;

    for (final permission in requiredPermissions) {
      final status = await permission.status;
      if (!status.isGranted && !status.isLimited) {
        return false;
      }
    }
    return true;
  }

  /// Requests all required permissions from the OS.
  Future<Map<Permission, PermissionStatus>> requestPermissions() async {
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains(
      'Test',
    );
    if (isTest || kIsWeb) {
      return {for (final p in requiredPermissions) p: PermissionStatus.granted};
    }

    final statuses = await requiredPermissions.request();
    return statuses;
  }

  /// Checks if any required permission is permanently denied (requiring user to open Settings).
  Future<bool> hasPermanentlyDeniedPermissions() async {
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains(
      'Test',
    );
    if (isTest || kIsWeb) return false;

    for (final permission in requiredPermissions) {
      final status = await permission.status;
      if (status.isPermanentlyDenied) {
        return true;
      }
    }
    return false;
  }

  /// Opens the device App Settings screen so user can grant denied permissions.
  Future<bool> openSettings() async {
    return await openAppSettings();
  }

  /// Exits the application cleanly.
  void exitApp() {
    SystemNavigator.pop();
  }
}
