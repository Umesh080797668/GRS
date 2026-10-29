import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/screens/client/client_form_screen.dart';
import 'package:mobile/screens/client/consent_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    final enFile = File('lib/l10n/app_en.arb');
    if (enFile.existsSync()) {
      final json =
          jsonDecode(enFile.readAsStringSync()) as Map<String, dynamic>;
      final map = json.map((k, v) => MapEntry(k, v.toString()));
      GrsL10n.setCache('en', map);
    }
  });

  group('Consent Flow & Enforced Verification Tests (M2.9)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('consent_test_');
      dbFile = File('${tempDir.path}/consent.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );

      await db.upsertHousehold(
        Household(
          id: 'h-test',
          districtId: 'dist-1',
          dsId: 'ds-1',
          gnId: 'gn-1',
          serialNo: 1,
          houseNo: '10A',
          houseLeaderName: 'Leader Test',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    testWidgets(
      'Proceed button is disabled until consent checkbox is checked',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(400, 1600);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          const MaterialApp(
            locale: Locale('en'),
            localizationsDelegates: [
              GrsLocalizationsDelegate(),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: ConsentScreen(houseId: 'h-test'),
          ),
        );
        await tester.pumpAndSettle();

        // Checkbox is initially unchecked
        final checkboxFinder = find.byType(CheckboxListTile);
        expect(checkboxFinder, findsOneWidget);

        final buttonFinder = find.widgetWithText(
          GrsButton,
          'Proceed to Beneficiary Form',
        );
        expect(buttonFinder, findsOneWidget);

        final buttonWidget = tester.widget<GrsButton>(buttonFinder);
        expect(buttonWidget.onPressed, isNull); // Disabled!

        // Check the consent box
        await tester.ensureVisible(checkboxFinder);
        await tester.tap(checkboxFinder);
        await tester.pumpAndSettle();

        // Button is now enabled!
        final enabledButton = tester.widget<GrsButton>(buttonFinder);
        expect(enabledButton.onPressed, isNotNull);
      },
    );

    testWidgets('Cannot save client record without consent (M2.9 Done When)', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(400, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [databaseProvider.overrideWith((ref) => Future.value(db))],
          child: const MaterialApp(
            locale: Locale('en'),
            localizationsDelegates: [
              GrsLocalizationsDelegate(),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: ClientFormScreen(
              houseId: 'h-test',
              consentGiven: false, // NO CONSENT
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Enter valid name and age
      await tester.enterText(find.byType(TextFormField).first, 'Kamal Perera');
      await tester.enterText(find.byType(TextFormField).at(1), '25');
      await tester.pump();

      // Attempt to save and finish
      final saveButton = find.widgetWithText(GrsButton, 'Save & Finish House');
      expect(saveButton, findsOneWidget);

      await tester.ensureVisible(saveButton);
      await tester.tap(saveButton);
      await tester.pump();

      // SnackBar error displayed
      expect(
        find.text('Cannot save without informed consent.'),
        findsOneWidget,
      );

      // Database MUST have zero pending clients
      final pendingInDb = await db.getAllClients(status: SyncStatus.pending);
      expect(pendingInDb.isEmpty, isTrue);
    });
  });
}
