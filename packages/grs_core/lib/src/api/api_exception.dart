/// Error mapping for GRS API responses per DD-Campaign_Agent_Build_Plan.md §6.
/// Standard error contract: { "code": "STRING_CODE", "message_key": "i18n.key", "details": {} }
class GrsApiException implements Exception {
  final int statusCode;
  final String code;
  final String messageKey;
  final Map<String, dynamic> details;
  final int? retryAfterSeconds;

  const GrsApiException({
    required this.statusCode,
    required this.code,
    required this.messageKey,
    this.details = const {},
    this.retryAfterSeconds,
  });

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isVersionGate => statusCode == 426;
  bool get isRateLimited => statusCode == 429;
  bool get isServerBusy => statusCode == 503;
  bool get isAccountDeactivated =>
      code == 'ACCOUNT_DEACTIVATED' || messageKey == 'errors.auth.deactivated';
  bool get isPasswordExpired =>
      code == 'PASSWORD_EXPIRED' ||
      messageKey == 'errors.auth.initial_password_expired';
  bool get isAccountLocked =>
      code == 'ACCOUNT_LOCKED' || messageKey == 'errors.auth.account_locked';

  @override
  String toString() =>
      'GrsApiException(status: $statusCode, code: $code, messageKey: $messageKey, details: $details, retryAfter: $retryAfterSeconds)';
}
