import 'package:flutter/services.dart';

/// Provides security utilities including screenshot protection (FLAG_SECURE)
/// and memory/clipboard sanitization for sensitive ephemeral screens.
class SecurityService {
  static const _channel = MethodChannel('lk.gov.grs/security');

  /// Prevents screenshots, screen recordings, and OS recents thumbnails.
  static Future<void> enableScreenshotProtection() async {
    try {
      await _channel.invokeMethod('enableSecureScreen');
    } catch (_) {
      // Gracefully ignore on unsupported platforms or during tests
    }
  }

  /// Restores normal screenshot capture capabilities.
  static Future<void> disableScreenshotProtection() async {
    try {
      await _channel.invokeMethod('disableSecureScreen');
    } catch (_) {
      // Gracefully ignore
    }
  }
}
