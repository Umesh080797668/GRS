import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/data/local/secure_storage_service.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/providers/auth_provider.dart';
import 'package:mobile/providers/connectivity_provider.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/screens/home/home_screen.dart';
import 'package:mobile/screens/level4/team_duplicates_screen.dart';

class _FakeConnectivityNotifier extends ConnectivityNotifier {
  final bool initialOnline;
  _FakeConnectivityNotifier(this.initialOnline) : super() {
    state = initialOnline;
  }
}

class _FakeSecureStorageService extends SecureStorageService {
  @override
  Future<String?> getAccessToken() async => 'test-jwt-token';
  @override
  Future<ProfileModel?> getActiveProfile() async => null;
}

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

  group('Level 4 Duplicates Review UI Tests (M6.4)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    const l4Profile = ProfileModel(
      id: 'u-l4-dup',
      userCode: 'GRS000010',
      role: 'cdc_secretary',
      fullName: 'Sunil Perera',
      preferredLanguage: 'en',
      gnId: 'gn-01',
      teamId: 'team-01',
      isActive: true,
      mustChangePassword: false,
    );

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('l4_dup_test_');
      dbFile = File('${tempDir.path}/test_l4_dup.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    Widget wrapScreen({
      required Widget screen,
      required http.Client httpClient,
      bool isOnline = true,
    }) {
      final apiClient = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: httpClient,
      );

      return ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) async => db),
          apiClientProvider.overrideWithValue(apiClient),
          connectivityProvider.overrideWith(
            (ref) => _FakeConnectivityNotifier(isOnline),
          ),
          authProvider.overrideWith(
            (ref) => AuthNotifier(
              apiClient: apiClient,
              storage: _FakeSecureStorageService(),
              initialState: AuthState(
                status: AuthStatus.authenticated,
                profile: l4Profile,
                isOffline: !isOnline,
              ),
            ),
          ),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: const [
            GrsLocalizationsDelegate(),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en'), Locale('si'), Locale('ta')],
          home: screen,
        ),
      );
    }

    Map<String, dynamic> sampleCandidate() => {
      'id': 'cand-1',
      'clientA': 'client-a',
      'clientB': 'client-b',
      'score': 92,
      'classification': 'probable',
      'reasons': {
        'factors': ['exact_phone', 'high_name_similarity', 'same_gn'],
      },
      'status': 'open',
      'createdAt': '2026-11-11T08:00:00Z',
      'clientARecord': {
        'id': 'client-a',
        'name': 'Nimali Silva',
        'age': 31,
        'gender': 'F',
        'phoneE164': '+94771234567',
        'houseNo': '104/A',
        'gnId': 'gn-01',
        'createdAt': '2026-11-10T08:00:00Z',
      },
      'clientBRecord': {
        'id': 'client-b',
        'name': 'Nimali De Silva',
        'age': 31,
        'gender': 'F',
        'phoneE164': '+94771234567',
        'houseNo': '104',
        'gnId': 'gn-01',
        'createdAt': '2026-11-11T08:00:00Z',
      },
    };

    testWidgets(
      'HomeScreen L4 hub displays Duplicates button and amber open count badge',
      (tester) async {
        tester.view.physicalSize = const Size(480, 960);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final mockClient = MockClient((request) async {
          if (request.url.path.endsWith('/v1/duplicates')) {
            return http.Response(
              jsonEncode({
                'items': [sampleCandidate()],
                'openCount': 3,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            '{}',
            200,
            headers: {'content-type': 'application/json'},
          );
        });

        await tester.pumpWidget(
          wrapScreen(screen: const HomeScreen(), httpClient: mockClient),
        );
        await tester.pumpAndSettle();

        expect(find.text('Duplicates'), findsOneWidget);
        expect(find.byKey(const Key('l4_duplicates_badge')), findsOneWidget);
        expect(find.text('3'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'TeamDuplicatesScreen selects canonical record and confirms duplicate',
      (tester) async {
        String? confirmPath;
        Map<String, dynamic>? confirmBody;
        bool resolved = false;

        final mockClient = MockClient((request) async {
          if (request.method == 'GET' &&
              request.url.path.endsWith('/v1/duplicates')) {
            return http.Response(
              jsonEncode({
                'items': resolved ? [] : [sampleCandidate()],
                'openCount': resolved ? 0 : 1,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.method == 'POST' &&
              request.url.path.endsWith('/v1/duplicates/cand-1/confirm')) {
            confirmPath = request.url.path;
            confirmBody = jsonDecode(request.body) as Map<String, dynamic>;
            resolved = true;
            return http.Response(
              jsonEncode({'id': 'cand-1', 'status': 'confirmed'}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 200);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const TeamDuplicatesScreen(),
            httpClient: mockClient,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Nimali Silva'), findsOneWidget);
        expect(find.text('Nimali De Silva'), findsOneWidget);
        expect(find.text('Probable • Score 92'), findsOneWidget);

        // Select Record B as canonical before confirming
        await tester.tap(find.text('Nimali De Silva'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Confirm Duplicate'));
        await tester.pumpAndSettle();

        expect(confirmPath, '/v1/duplicates/cand-1/confirm');
        expect(confirmBody?['canonicalClientId'], 'client-b');
        expect(find.text('No duplicate pairs to review.'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('TeamDuplicatesScreen dismisses false-positive pair cleanly', (
      tester,
    ) async {
      String? dismissPath;
      bool resolved = false;

      final mockClient = MockClient((request) async {
        if (request.method == 'GET' &&
            request.url.path.endsWith('/v1/duplicates')) {
          return http.Response(
            jsonEncode({
              'items': resolved ? [] : [sampleCandidate()],
              'openCount': resolved ? 0 : 1,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST' &&
            request.url.path.endsWith('/v1/duplicates/cand-1/dismiss')) {
          dismissPath = request.url.path;
          resolved = true;
          return http.Response(
            jsonEncode({'id': 'cand-1', 'status': 'dismissed'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 200);
      });

      await tester.pumpWidget(
        wrapScreen(
          screen: const TeamDuplicatesScreen(),
          httpClient: mockClient,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Dismiss'));
      await tester.pumpAndSettle();

      expect(dismissPath, '/v1/duplicates/cand-1/dismiss');
      expect(find.text('No duplicate pairs to review.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('TeamDuplicatesScreen shows offline notice when disconnected', (
      tester,
    ) async {
      var httpCalled = false;
      final mockClient = MockClient((_) async {
        httpCalled = true;
        return http.Response('{}', 200);
      });

      await tester.pumpWidget(
        wrapScreen(
          screen: const TeamDuplicatesScreen(),
          httpClient: mockClient,
          isOnline: false,
        ),
      );
      await tester.pumpAndSettle();

      expect(httpCalled, isFalse);
      expect(
        find.text(
          'Offline mode — connect to the internet to review and resolve duplicate pairs.',
        ),
        findsWidgets,
      );
      expect(tester.takeException(), isNull);
    });
  });
}
