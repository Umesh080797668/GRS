import 'dart:convert';
import 'env.dart';

/// Secure endpoint resolution for GRS Mobile.
///
/// Prevents plain-text exposure in [AppEnv] while ensuring the mobile client
/// reliably routes to the hosted production/staging backend instead of failing
/// or falling back to localhost.
class ApiEndpointResolver {
  // Hosted backend endpoint obfuscated to prevent static plain-text harvesting
  // Decodes to: https://grs-umber-eight.vercel.app
  static final String _hostedBackendUrl = utf8.decode(
    base64Decode('aHR0cHM6Ly9ncnMtdW1iZXItZWlnaHQudmVyY2VsLmFwcA=='),
  );

  /// Resolves authoritative backend URL.
  /// Priority:
  /// 1. Build-time `--dart-define=API_BASE_URL=...` (via AppEnv.defaultApiBaseUrl)
  /// 2. Hosted Vercel backend service
  static String resolveDefault() {
    final configured = AppEnv.defaultApiBaseUrl.trim();
    if (configured.isNotEmpty &&
        !configured.contains('localhost') &&
        !configured.contains('127.0.0.1')) {
      return configured;
    }
    return _hostedBackendUrl;
  }

  /// Sanitizes any persisted or dynamically provided URL, actively purging
  /// localhost / loopback addresses.
  static String sanitize(String? url) {
    if (url == null) return resolveDefault();
    final trimmed = url.trim();
    if (trimmed.isEmpty ||
        trimmed.contains('localhost') ||
        trimmed.contains('127.0.0.1')) {
      return resolveDefault();
    }
    return trimmed;
  }
}
