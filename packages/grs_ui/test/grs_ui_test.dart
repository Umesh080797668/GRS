import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_ui/grs_ui.dart';

void main() {
  group('GRS Design System Tokens (DESIGN.md)', () {
    test('enforces minimum touch target of 48dp', () {
      expect(GrsSpacing.minTouchTarget, equals(48.0));
    });

    test('verifies trilingual typography line height adjustment', () {
      final latinStyle = GrsTypography.bodyMedium(
        color: GrsColors.textPrimaryLight,
        languageCode: 'en',
      );
      final sinhalaStyle = GrsTypography.bodyMedium(
        color: GrsColors.textPrimaryLight,
        languageCode: 'si',
      );
      final tamilStyle = GrsTypography.bodyMedium(
        color: GrsColors.textPrimaryLight,
        languageCode: 'ta',
      );

      expect(latinStyle.height, lessThan(1.5));
      expect(sinhalaStyle.height, greaterThanOrEqualTo(1.5));
      expect(tamilStyle.height, greaterThanOrEqualTo(1.5));
    });

    testWidgets('renders GrsSyncBadge with correct label and icon', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: GrsSyncBadge(
              status: GrsSyncStatus.synced,
              label: 'Confirmed',
            ),
          ),
        ),
      );

      expect(find.text('Confirmed'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline_rounded), findsOneWidget);
    });

    testWidgets('renders GrsOfflineBanner with message', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: GrsOfflineBanner(message: 'Working Offline')),
        ),
      );

      expect(find.text('Working Offline'), findsOneWidget);
      expect(find.byIcon(Icons.wifi_off_rounded), findsOneWidget);
    });
  });
}
