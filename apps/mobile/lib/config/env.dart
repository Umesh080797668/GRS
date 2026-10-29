/// Authoritative client environment and bundled configuration for GRS Mobile.
///
/// NOTE (Security Invariant 5): Only public, client-safe configurations (such
/// as Supabase anon key, Sentry DSN, and API base URL) are bundled here.
/// Server service role keys are strictly server-side and MUST NEVER be added here.
class AppEnv {
  /// Default backend API URL.
  /// Can be overridden at build-time using:
  /// `--dart-define=API_BASE_URL=https://api.yourdomain.gov.lk`
  /// or dynamically at runtime via secure storage.
  static const String defaultApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// Supabase Tokyo project URL.
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );

  /// Supabase public anonymous key (safe for client bundling per Invariant 5).
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  /// Sentry error reporting DSN (PII scrubbed).
  static const String sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );
}
