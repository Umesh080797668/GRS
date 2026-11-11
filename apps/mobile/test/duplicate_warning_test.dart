import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
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

  group('On-Device Same-House Duplicate Warning (M6.3)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('dup_warn_test_');
      dbFile = File('${tempDir.path}/dup_warn.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );

      await db.upsertHousehold(
        Household(
          id: 'house-dup-1',
          districtId: 'dist-1',
          dsId: 'ds-1',
          gnId: 'gn-1',
          serialNo: 10,
          houseNo: 'HN-10',
          houseLeaderName: 'Nimal Bandara',
          address: '10 Main Road',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      );

      await db.saveClient(
        client: Client(
          id: 'existing-client-1',
          householdId: 'house-dup-1',
          name: 'Kavinda Bandara',
          age: 24,
          gender: 'M',
          address: '10 Main Road',
          phoneRaw: '0771234567',
          phoneE164: '+94771234567',
          futureHopes: const ['higher_ed'],
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
        status: SyncStatus.pending,
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    Widget buildTestRouterApp() {
      final router = GoRouter(
        initialLocation: '/houses/house-dup-1/client/new?consent=true',
        routes: [
          GoRoute(
            path: '/houses/:id/client/new',
            builder: (context, state) => ClientFormScreen(
              houseId: state.pathParameters['id']!,
              consentGiven: state.uri.queryParameters['consent'] == 'true',
            ),
          ),
          GoRoute(
            path: '/houses/:id/client/:clientId',
            builder: (context, state) => ClientFormScreen(
              houseId: state.pathParameters['id']!,
              clientId: state.pathParameters['clientId'],
            ),
          ),
        ],
      );

      return ProviderScope(
        overrides: [databaseProvider.overrideWith((ref) => Future.value(db))],
        child: MaterialApp.router(
          locale: const Locale('en'),
          localizationsDelegates: const [
            GrsLocalizationsDelegate(),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en'), Locale('si'), Locale('ta')],
          routerConfig: router,
        ),
      );
    }

    testWidgets(
      'shows warning on similar name in same house, opens existing, and never blocks saving',
      (tester) async {
        tester.view.physicalSize = const Size(500, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(buildTestRouterApp());
        await tester.pumpAndSettle();

        // Enter reversed/similar name matching 'Kavinda Bandara'
        await tester.enterText(
          find.byKey(const Key('client_form_name_field')),
          'Bandara Kavinda',
        );
        await tester.pumpAndSettle();

        expect(
          find.byKey(const Key('duplicate_warning_banner')),
          findsOneWidget,
        );
        expect(find.textContaining('Kavinda Bandara'), findsOneWidget);

        // Fill valid age and save WITHOUT dismissing warning -> must never block!
        await tester.enterText(
          find.byKey(const Key('client_form_age_field')),
          '24',
        );
        await tester.pumpAndSettle();

        final saveFinishBtn = find.text('Save & Finish House');
        await tester.ensureVisible(saveFinishBtn);
        await tester.tap(saveFinishBtn);
        await tester.pumpAndSettle();

        final clients = await db.getClientsForHousehold('house-dup-1');
        expect(clients.length, equals(2));
      },
    );

    testWidgets(
      'shows warning on matching phone even with different name and opens existing on tap',
      (tester) async {
        tester.view.physicalSize = const Size(500, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(buildTestRouterApp());
        await tester.pumpAndSettle();

        await tester.enterText(
          find.byKey(const Key('client_form_name_field')),
          'Ruwan Perera',
        );
        await tester.enterText(
          find.byKey(const Key('client_form_phone_field')),
          '+94771234567',
        );
        await tester.pumpAndSettle();

        expect(
          find.byKey(const Key('duplicate_warning_banner')),
          findsOneWidget,
        );
        expect(find.text('Same phone number'), findsOneWidget);

        // Tap 'Open existing' navigates to existing-client-1
        final openBtn = find.text('Open existing');
        await tester.ensureVisible(openBtn);
        await tester.tap(openBtn);
        await tester.pumpAndSettle();

        expect(find.text('Kavinda Bandara'), findsAtLeastNWidgets(1));
      },
    );
  });
}
