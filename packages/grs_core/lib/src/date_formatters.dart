/// Core date/time formatting utilities strictly adhering to GMT+5:30 (Asia/Colombo / Sri Lanka Standard Time).
/// Per DD-Campaign Agent Build Plan Rule 12: "Dates: store UTC; display in Asia/Colombo."
/// Standard duration offset for Asia/Colombo (UTC+05:30).
const Duration colomboTimezoneOffset = Duration(hours: 5, minutes: 30);

/// Converts a DateTime into Colombo time (UTC+05:30).
DateTime toColomboTime(DateTime dt) {
  return dt.toUtc().add(colomboTimezoneOffset);
}

/// Formats a DateTime into standard display string in GMT+5:30: "YYYY-MM-DD HH:mm".
String formatColomboDateTime(DateTime? dt) {
  if (dt == null) return '-';
  final c = toColomboTime(dt);
  final y = c.year.toString().padLeft(4, '0');
  final m = c.month.toString().padLeft(2, '0');
  final d = c.day.toString().padLeft(2, '0');
  final h = c.hour.toString().padLeft(2, '0');
  final min = c.minute.toString().padLeft(2, '0');
  return '$y-$m-$d $h:$min';
}

/// Formats a DateTime into standard date-only string in GMT+5:30: "YYYY-MM-DD".
String formatColomboDate(DateTime? dt) {
  if (dt == null) return '-';
  final c = toColomboTime(dt);
  final y = c.year.toString().padLeft(4, '0');
  final m = c.month.toString().padLeft(2, '0');
  final d = c.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Formats a DateTime into time-only string in GMT+5:30: "HH:mm".
String formatColomboTime(DateTime? dt) {
  if (dt == null) return '-';
  final c = toColomboTime(dt);
  final h = c.hour.toString().padLeft(2, '0');
  final min = c.minute.toString().padLeft(2, '0');
  return '$h:$min';
}
