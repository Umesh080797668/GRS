import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/database_provider.dart';
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

  group('My Records & Sync Status Badges Tests (M2.10)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('my_records_test_');
      dbFile = File('${tempDir.path}/records.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );

      final now = DateTime.now();

      // Seed 4 clients with different sync statuses
      await db.saveClient(
        client: Client(
          id: 'rec-draft',
          householdId: 'h-1',
          name: 'Draft User',
          age: 20,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: false,
          createdAt: now,
          updatedAt: now,
        ),
        status: SyncStatus.draft,
      );

      await db.saveClient(
        client: Client(
          id: 'rec-pending',
          householdId: 'h-1',
          name: 'Pending User',
          age: 24,
          gender: 'F',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: now,
          updatedAt: now,
        ),
        status: SyncStatus.pending,
      );

      await db.saveClient(
        client: Client(
          id: 'rec-synced',
          householdId: 'h-1',
          name: 'Synced User',
          age: 32,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: now,
          updatedAt: now,
        ),
        status: SyncStatus.synced,
      );

      await db.saveClient(
        client: Client(
          id: 'rec-rejected',
          householdId: 'h-1',
          name: 'Rejected User',
          age: 45,
          gender: 'F',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: now,
          updatedAt: now,
        ),
        status: SyncStatus.rejected,
      );
      await db.updateClientSyncStatus(
        'rec-rejected',
        status: SyncStatus.rejected,
        errorCode: 'INVALID_AGE_RANGE',
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    testWidgets(
      'My records renders all entered items and filters by status badge',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(800, 1200);
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
              home: MyRecordsScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Initially 'All' is selected -> all 4 records present
        expect(find.text('Draft User'), findsOneWidget);
        expect(find.text('Pending User'), findsOneWidget);
        expect(find.text('Synced User'), findsOneWidget);
        expect(find.text('Rejected User'), findsOneWidget);

        // Filter by 'Synced'
        final syncedChip = find.widgetWithText(ChoiceChip, 'Synced');
        expect(syncedChip, findsOneWidget);

        await tester.ensureVisible(syncedChip);
        await tester.tap(syncedChip);
        await tester.pumpAndSettle();

        // Only 'Synced User' visible
        expect(find.text('Synced User'), findsOneWidget);
        expect(find.text('Draft User'), findsNothing);
        expect(find.text('Pending User'), findsNothing);

        // Filter by 'Rejected'
        final rejectedChip = find.widgetWithText(ChoiceChip, 'Rejected');
        expect(rejectedChip, findsOneWidget);

        await tester.ensureVisible(rejectedChip);
        await tester.tap(rejectedChip);
        await tester.pumpAndSettle();

        expect(find.text('Rejected User'), findsOneWidget);
        expect(find.text('Reason: INVALID_AGE_RANGE'), findsOneWidget);

        // Tap rejected record -> opens fix dialog
        await tester.tap(find.text('Rejected User'));
        await tester.pumpAndSettle();

        expect(find.text('Record Rejected'), findsOneWidget);
        expect(
          find.widgetWithText(ElevatedButton, 'Fix & Resubmit'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'Restricts editing to pending records (synced records are locked, M2.10)',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(800, 1200);
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
              home: MyRecordsScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Synced record displays lock icon and shows locked dialog on tap
        expect(find.byIcon(Icons.lock_outline), findsOneWidget);
        expect(find.byIcon(Icons.edit_outlined), findsOneWidget);

        await tester.tap(find.text('Synced User'));
        await tester.pumpAndSettle();

        expect(find.text('Record Locked'), findsOneWidget);
        expect(
          find.textContaining(
            'This record has already been synced to the central server and is locked',
          ),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(ElevatedButton, 'View Read-Only'),
          findsOneWidget,
        );
      },
    );
  });
}
