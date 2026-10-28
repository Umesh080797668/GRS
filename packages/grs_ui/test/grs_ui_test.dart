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

    testWidgets('GrsButton enforces 48dp height and responds to tap', (
      WidgetTester tester,
    ) async {
      bool tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GrsButton(
              text: 'Save Record',
              onPressed: () => tapped = true,
            ),
          ),
        ),
      );

      final buttonFinder = find.byType(GrsButton);
      expect(buttonFinder, findsOneWidget);

      final size = tester.getSize(buttonFinder);
      expect(size.height, greaterThanOrEqualTo(48.0));

      await tester.tap(buttonFinder);
      expect(tapped, isTrue);
    });

    testWidgets('GrsTextField renders input with label and accepts text', (
      WidgetTester tester,
    ) async {
      final controller = TextEditingController();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GrsTextField(
              label: 'Beneficiary Name',
              controller: controller,
            ),
          ),
        ),
      );

      expect(find.text('Beneficiary Name'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), 'Kamal Perera');
      expect(controller.text, equals('Kamal Perera'));
    });

    testWidgets('GrsDropdown renders with items', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GrsDropdown<String>(
              label: 'Gender',
              value: 'M',
              items: const [
                GrsDropdownItem(value: 'F', label: 'Female'),
                GrsDropdownItem(value: 'M', label: 'Male'),
              ],
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('Gender'), findsOneWidget);
      expect(find.text('Male'), findsOneWidget);
    });

    testWidgets(
      'GrsScaffold displays civic title and offline banner when offline',
      (WidgetTester tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: GrsScaffold(
              title: 'House Survey',
              subtitle: 'Team 01',
              isOffline: true,
              body: Text('House Content'),
            ),
          ),
        );

        expect(find.text('House Survey'), findsOneWidget);
        expect(find.text('Team 01'), findsOneWidget);
        expect(find.byType(GrsOfflineBanner), findsOneWidget);
        expect(find.text('House Content'), findsOneWidget);
      },
    );

    testWidgets(
      'Typography renders Sinhala, Tamil, and English at 200% font scale without overflow',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(360, 640);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          MaterialApp(
            theme: GrsTheme.lightTheme(),
            home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(2.0)),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: Column(
                    children: [
                      Text(
                        'Door-to-Door Skills Campaign 2026',
                        style: GrsTypography.bodyLarge(
                          color: GrsColors.textPrimaryLight,
                          languageCode: 'en',
                        ),
                      ),
                      Text(
                        'ගෙයින් ගෙට නිපුණතා සංගණනය 2026',
                        style: GrsTypography.bodyLarge(
                          color: GrsColors.textPrimaryLight,
                          languageCode: 'si',
                        ),
                      ),
                      Text(
                        'வீடு வீடாகச் சென்று திறன்கள் கணக்கெடுப்பு 2026',
                        style: GrsTypography.bodyLarge(
                          color: GrsColors.textPrimaryLight,
                          languageCode: 'ta',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Door-to-Door Skills Campaign 2026'), findsOneWidget);
        expect(find.text('ගෙයින් ගෙට නිපුණතා සංගණනය 2026'), findsOneWidget);
        expect(
          find.text('வீடு வீடாகச் சென்று திறன்கள் கணக்கெடுப்பு 2026'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  });
}
