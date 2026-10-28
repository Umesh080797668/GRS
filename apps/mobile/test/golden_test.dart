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
import 'package:mobile/screens/auth/login_screen.dart';
import 'package:mobile/screens/records/my_records_screen.dart';

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

  group('Visual Golden Tests (M2.2, M2.8, M2.10)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('goldens_db_');
      dbFile = File('${tempDir.path}/goldens.db');
      db = await AppDatabase.open(file: dbFile, cipherKey: cipherKey);

      await db.saveClient(
        client: Client(
          id: 'client-g-1',
          householdId: 'h-1',
          name: 'Sunil Shantha',
          age: 28,
          gender: 'M',
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

    testWidgets('GrsSyncBadge visual states golden (M2.2, M2.10)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.light(),
          home: const Scaffold(
            body: Center(
              child: RepaintBoundary(
                key: ValueKey('sync_badges_key'),
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      GrsSyncBadge(status: GrsSyncStatus.draft, label: 'Draft'),
                      SizedBox(height: 8),
                      GrsSyncBadge(
                        status: GrsSyncStatus.pending,
                        label: 'Pending Sync',
                      ),
                      SizedBox(height: 8),
                      GrsSyncBadge(
                        status: GrsSyncStatus.synced,
                        label: 'Confirmed Synced',
                      ),
                      SizedBox(height: 8),
                      GrsSyncBadge(
                        status: GrsSyncStatus.rejected,
                        label: 'Rejected Fix Required',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await expectLater(
        find.byKey(const ValueKey('sync_badges_key')),
        matchesGoldenFile('goldens/sync_badges.png'),
      );
    });

    testWidgets('Login credential screen visual layout golden (M2.2, M2.5)', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            locale: Locale('en'),
            localizationsDelegates: [
              GrsLocalizationsDelegate(),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: LoginScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await expectLater(
        find.byType(LoginScreen),
        matchesGoldenFile('goldens/login_screen.png'),
      );
    });

    testWidgets('My Records screen visual layout golden (M2.10)', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(800, 1200);
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
            home: MyRecordsScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await expectLater(
        find.byType(MyRecordsScreen),
        matchesGoldenFile('goldens/my_records_screen.png'),
      );
    });
  });
}
