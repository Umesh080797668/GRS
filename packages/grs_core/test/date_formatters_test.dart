import 'package:test/test.dart';
import 'package:grs_core/grs_core.dart';

void main() {
  group('GMT+5:30 (Asia/Colombo) Date & Time Formatting', () {
    test('colomboTimezoneOffset is exactly 5 hours 30 minutes', () {
      expect(colomboTimezoneOffset.inMinutes, equals(330));
      expect(colomboTimezoneOffset.inHours, equals(5));
    });

    test('toColomboTime converts UTC DateTime to GMT+5:30', () {
      final utc = DateTime.utc(2026, 11, 13, 0, 0); // 00:00 UTC
      final colombo = toColomboTime(utc);
      expect(colombo.year, equals(2026));
      expect(colombo.month, equals(11));
      expect(colombo.day, equals(13));
      expect(colombo.hour, equals(5));
      expect(colombo.minute, equals(30));
    });

    test('toColomboTime handles day boundary transitions', () {
      final utc = DateTime.utc(2026, 11, 13, 19, 0); // 19:00 UTC
      final colombo = toColomboTime(utc);
      expect(colombo.year, equals(2026));
      expect(colombo.month, equals(11));
      expect(colombo.day, equals(14));
      expect(colombo.hour, equals(0));
      expect(colombo.minute, equals(30));
    });

    test('formatColomboDateTime formats DateTime into YYYY-MM-DD HH:mm', () {
      final dt = DateTime.utc(2026, 11, 13, 10, 45); // 10:45 UTC -> 16:15 IST
      expect(formatColomboDateTime(dt), equals('2026-11-13 16:15'));
      expect(formatColomboDateTime(null), equals('-'));
    });

    test('formatColomboDate formats DateTime into YYYY-MM-DD', () {
      final dt1 = DateTime.utc(2026, 11, 13, 18, 0); // 23:30 IST -> Nov 13
      final dt2 = DateTime.utc(2026, 11, 13, 19, 0); // 00:30 IST -> Nov 14
      expect(formatColomboDate(dt1), equals('2026-11-13'));
      expect(formatColomboDate(dt2), equals('2026-11-14'));
      expect(formatColomboDate(null), equals('-'));
    });

    test('formatColomboTime formats DateTime into HH:mm', () {
      final dt = DateTime.utc(2026, 11, 13, 0, 0); // 05:30 IST
      expect(formatColomboTime(dt), equals('05:30'));
      expect(formatColomboTime(null), equals('-'));
    });
  });
}

