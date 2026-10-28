import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

Future<void> _loadFonts() async {
  Future<ByteData> loadFont(String path) async {
    final file = File(path);
    final bytes = await file.readAsBytes();
    return ByteData.sublistView(bytes);
  }

  // 1. MaterialIcons font for crisp UI icons
  final materialLoader = FontLoader('MaterialIcons');
  materialLoader.addFont(loadFont('assets/fonts/MaterialIcons-Regular.otf'));
  await materialLoader.load();

  // 2. NotoSansSinhala font
  final sinhalaLoader = FontLoader('NotoSansSinhala');
  sinhalaLoader.addFont(loadFont('assets/fonts/NotoSansSinhala-Regular.ttf'));
  sinhalaLoader.addFont(loadFont('assets/fonts/NotoSansSinhala-Bold.ttf'));
  await sinhalaLoader.load();

  // 3. NotoSansTamil font
  final tamilLoader = FontLoader('NotoSansTamil');
  tamilLoader.addFont(loadFont('assets/fonts/NotoSansTamil-Regular.ttf'));
  tamilLoader.addFont(loadFont('assets/fonts/NotoSansTamil-Bold.ttf'));
  await tamilLoader.load();

  // 4. Inter font (GrsTypography.fontLatin)
  final interLoader = FontLoader('Inter');
  interLoader.addFont(loadFont('assets/fonts/NotoSans-Regular.ttf'));
  interLoader.addFont(loadFont('assets/fonts/NotoSans-Bold.ttf'));
  await interLoader.load();

  // 5. Roboto font (default Material fallback)
  final robotoLoader = FontLoader('Roboto');
  robotoLoader.addFont(loadFont('assets/fonts/NotoSans-Regular.ttf'));
  robotoLoader.addFont(loadFont('assets/fonts/NotoSans-Bold.ttf'));
  await robotoLoader.load();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await _loadFonts();

    // Cache trilingual ARB localization maps
    for (final lang in ['en', 'si', 'ta']) {
      final arbFile = File('lib/l10n/app_$lang.arb');
      if (arbFile.existsSync()) {
        final json =
            jsonDecode(arbFile.readAsStringSync()) as Map<String, dynamic>;
        final map = json.map((k, v) => MapEntry(k, v.toString()));
        GrsL10n.setCache(lang, map);
      }
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
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );

      // Seed multi-lingual sample records for realistic text validation
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

      await db.saveClient(
        client: Client(
          id: 'client-g-2',
          householdId: 'h-1',
          name: 'සුනිල් ශාන්ත',
          age: 32,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
        status: SyncStatus.pending,
      );

      await db.saveClient(
        client: Client(
          id: 'client-g-3',
          householdId: 'h-2',
          name: 'சுனில் சாந்தா',
          age: 45,
          gender: 'F',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
        status: SyncStatus.synced,
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
          theme: ThemeData.light().copyWith(
            textTheme: const TextTheme(
              bodyMedium: TextStyle(fontFamily: 'Inter'),
            ),
          ),
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

    testWidgets(
      'Trilingual typography & complex Indic conjuncts golden (M2.2, M2.3)',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(600, 800);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              backgroundColor: Colors.white,
              body: Center(
                child: RepaintBoundary(
                  key: const ValueKey('trilingual_typography_key'),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'GRS Trilingual Typography System (M2.2)',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF1B365D),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // English
                        const Text(
                          'English: Democratic Socialist Republic of Sri Lanka - Field Survey',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 16,
                            height: 1.35,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Sinhala with complex conjuncts (රේඵය, යන්සය, රකාරාංශය)
                        const Text(
                          'සිංහල: ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජය - ක්ෂේත්‍ර සමීක්ෂණ නිලධාරී',
                          style: TextStyle(
                            fontFamily: 'NotoSansSinhala',
                            fontSize: 16,
                            height: 1.56,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Tamil with complex ligatures and vowel signs
                        const Text(
                          'தமிழ்: இலங்கை சனநாயக சோசலிசக் குடியரசு - கள ஆய்வு உத்தியோகத்தர்',
                          style: TextStyle(
                            fontFamily: 'NotoSansTamil',
                            fontSize: 16,
                            height: 1.56,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 24),
                        // Interactive action buttons with real Material icons
                        Row(
                          children: [
                            ElevatedButton.icon(
                              onPressed: () {},
                              icon: const Icon(Icons.download_rounded),
                              label: const Text(
                                'Download Area / ප්‍රදේශ දත්ත බාගන්න',
                                style: TextStyle(fontFamily: 'NotoSansSinhala'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            const Icon(
                              Icons.lock_outline,
                              color: Colors.blueGrey,
                            ),
                          ],
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
          find.byKey(const ValueKey('trilingual_typography_key')),
          matchesGoldenFile('goldens/trilingual_typography.png'),
        );
      },
    );
  });
}
