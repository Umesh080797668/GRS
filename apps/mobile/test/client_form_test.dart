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

  group('Client Form & Traceability Verification Tests (M2.8)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('client_form_test_');
      dbFile = File('${tempDir.path}/client_form.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );

      await db.upsertHousehold(
        Household(
          id: 'house-101',
          districtId: 'dist-1',
          dsId: 'ds-1',
          gnId: 'gn-1',
          serialNo: 101,
          houseNo: 'HN-101',
          houseLeaderName: 'Leader Test',
          address: '101 Temple Road',
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
      'Client form contains all 10.1–10.13 fields and saves pending record',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(400, 1200);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              databaseProvider.overrideWith((ref) => Future.value(db)),
            ],
            child: const MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: ClientFormScreen(houseId: 'house-101', consentGiven: true),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Traceability verification:
        // Auto-filled house headers
        expect(find.text('HN-101'), findsOneWidget);
        expect(find.text('Leader Test'), findsOneWidget);

        // 10.1 Name
        final nameField = find.byType(TextFormField).first;
        await tester.enterText(nameField, 'Saman Kumara');

        // 10.2 Age
        final ageField = find.byType(TextFormField).at(1);
        await tester.enterText(ageField, '28');

        // Gender toggle (Female / Male)
        expect(find.text('Female'), findsOneWidget);
        expect(find.text('Male'), findsOneWidget);

        // 10.3 Address (prefilled)
        expect(find.text('101 Temple Road'), findsOneWidget);

        // 10.4 & 10.5 Phone & WhatsApp
        final phoneField = find.byType(TextFormField).at(3);
        await tester.enterText(phoneField, '0771234567');

        // 10.10 Welfare checkboxes (EPF, ETF, Aswesuma, Samurdhi)
        expect(find.text('EPF Member'), findsOneWidget);
        expect(find.text('ETF Member'), findsOneWidget);
        expect(find.text('Aswesuma Beneficiary'), findsOneWidget);
        expect(find.text('Samurdhi Beneficiary'), findsOneWidget);

        // 10.11 Special needs
        expect(find.text('Special Needs Present'), findsOneWidget);

        // 10.12 Future hopes chips
        expect(find.text('Higher Education'), findsOneWidget);
        expect(find.text('Vocational Education'), findsOneWidget);
        expect(find.text('Entrepreneurship / Self-employment'), findsOneWidget);

        // 10.13 Info provided by
        expect(find.text('Information Provided By'), findsOneWidget);

        // Save and Finish House
        final saveFinishBtn = find.widgetWithText(
          GrsButton,
          'Save & Finish House',
        );
        await tester.ensureVisible(saveFinishBtn);
        await tester.tap(saveFinishBtn);
        await tester.pumpAndSettle();

        // Database assertion
        final pendingClients = await db.getAllClients(
          status: SyncStatus.pending,
        );
        expect(pendingClients.length, equals(1));
        expect(pendingClients.first['name'], equals('Saman Kumara'));
        expect(pendingClients.first['age'], equals(28));
        expect(pendingClients.first['phone_e164'], equals('+94771234567'));
        expect(pendingClients.first['sync_status'], equals('pending'));
      },
    );

    testWidgets(
      'Synced record remains editable and displays synced notice (Blueprint §7.4 & §10.1)',
      (WidgetTester tester) async {
        // Create an already-synced client in database
        final syncedClient = Client(
          id: 'c-synced-1',
          householdId: 'house-101',
          name: 'Confirmed Beneficiary',
          age: 30,
          gender: 'F',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await db.saveClient(
          client: syncedClient,
          status: SyncStatus.synced,
          baseVersion: 1,
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              databaseProvider.overrideWith((ref) => Future.value(db)),
            ],
            child: const MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: ClientFormScreen(
                houseId: 'house-101',
                clientId: 'c-synced-1',
                consentGiven: true,
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Synced notice banner must be displayed (Blueprint §7.4)
        expect(find.textContaining('Synced with server'), findsOneWidget);

        // Edit action buttons MUST be shown so field typos can be fixed per Blueprint §7.4 & §10.1
        expect(
          find.widgetWithText(GrsButton, 'Save & Finish House'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(GrsButton, 'Save & Add Next Beneficiary'),
          findsOneWidget,
        );
      },
    );
  });
}
