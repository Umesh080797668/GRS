import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/screens/home/home_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('House List & 2,000 Houses Virtualized Scrolling Tests (M2.7)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('house_scroll_test_');
      dbFile = File('${tempDir.path}/test_2000.db');
      db = await AppDatabase.open(file: dbFile, cipherKey: cipherKey);
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    testWidgets('2,000 houses render and scroll smoothly (M2.7 Done When)', (
      WidgetTester tester,
    ) async {
      // 1. Bulk insert 2,000 households into local Drift database
      final now = DateTime.now();
      for (var i = 1; i <= 2000; i++) {
        await db.upsertHousehold(
          Household(
            id: 'h-$i',
            districtId: 'dist-01',
            dsId: 'ds-01',
            gnId: 'gn-01',
            serialNo: i,
            houseNo: 'HN-$i',
            houseLeaderName: 'House Leader #$i',
            villageName: 'Sample Village',
            isEpf: i % 2 == 0,
            isAswesuma: i % 3 == 0,
            createdAt: now,
            updatedAt: now,
          ),
          status: i % 4 == 0
              ? 'completed'
              : (i % 2 == 0 ? 'in_progress' : 'not_started'),
        );
      }

      final countRows = await db.getHouseholds();
      expect(countRows.length, equals(2000));

      // 2. Render HomeScreen with 2,000 houses in virtualized ListView
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [databaseProvider.overrideWith((ref) => Future.value(db))],
          child: const MaterialApp(home: HomeScreen()),
        ),
      );

      await tester.pumpAndSettle();

      // Top of list visible
      expect(find.textContaining('HN-1'), findsWidgets);
      expect(find.textContaining('HN-2000'), findsNothing);

      // 3. Scroll aggressively through virtualized list
      final listFinder = find.byType(ListView);
      expect(listFinder, findsOneWidget);

      await tester.drag(listFinder, const Offset(0, -3000));
      await tester.pumpAndSettle();

      // Deeper elements rendered cleanly
      expect(find.byType(ListTile), findsWidgets);
      expect(tester.takeException(), isNull);

      // 4. Test Search filter
      final searchInput = find.byType(TextField);
      expect(searchInput, findsOneWidget);

      await tester.enterText(searchInput, 'HN-1999');
      await tester.pumpAndSettle();

      expect(find.textContaining('HN-1999'), findsWidgets);
      expect(find.textContaining('HN-1 '), findsNothing);
    });
  });
}
