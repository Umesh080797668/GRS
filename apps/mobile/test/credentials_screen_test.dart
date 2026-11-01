import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import 'package:mobile/screens/level4/team_members_screen.dart';

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

  group('M4.3 Credentials Screen Security & Sanitization Tests', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    final l4Profile = const ProfileModel(
      id: 'l4-user-1',
      userCode: 'L4001',
      role: 'cdc_secretary',
      fullName: 'Sunil Perera (CDC Secretary)',
      preferredLanguage: 'en',
      gnId: 'gn-colombo-01',
      teamId: 'team-01',
      isActive: true,
      mustChangePassword: false,
    );

    setUp(() async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('lk.gov.grs/security'),
            (call) async => null,
          );

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (
            MethodCall methodCall,
          ) async {
            if (methodCall.method == 'Clipboard.setData') {
              return null;
            }
            if (methodCall.method == 'Clipboard.getData') {
              return {'text': ''};
            }
            return null;
          });

      tempDir = await Directory.systemTemp.createTemp('credentials_test_');
      dbFile = File('${tempDir.path}/test_cred.db');
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
            (ref) => ConnectivityNotifier(autoInit: false)..state = true,
          ),
          authProvider.overrideWith(
            (ref) => AuthNotifier(
              apiClient: apiClient,
              storage: _FakeSecureStorageService(),
              initialState: AuthState(
                status: AuthStatus.authenticated,
                profile: l4Profile,
                isOffline: false,
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
          home: screen,
        ),
      );
    }

    testWidgets(
      'Account creation displays ephemeral credentials dialog with copy, share, and auto-clear',
      (tester) async {
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/accounts' && request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'accounts': [
                  {
                    'id': 'acc-1',
                    'userCode': 'TM001',
                    'fullName': 'Kamal Silva',
                    'role': 'team_member',
                    'isActive': true,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/v1/accounts' && request.method == 'POST') {
            return http.Response(
              jsonEncode({
                'user': {
                  'id': 'acc-new-1',
                  'userCode': 'TM002',
                  'fullName': 'Kasun Silva',
                  'initialPassword': 'TempPassword123!',
                },
              }),
              201,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(screen: const TeamMembersScreen(), httpClient: mockClient),
        );
        await tester.pumpAndSettle();

        // Tap Add Single Member button (icon: person_add_outlined)
        await tester.tap(find.byIcon(Icons.person_add_outlined));
        await tester.pumpAndSettle();
        expect(find.text('Add Team Member'), findsOneWidget);

        // Enter member name
        await tester.enterText(find.byType(TextField).first, 'Kasun Silva');
        await tester.pumpAndSettle();

        // Tap Create
        await tester.tap(find.widgetWithText(ElevatedButton, 'Create'));
        await tester.pumpAndSettle();

        // Verify Ephemeral Credentials Modal is displayed
        expect(find.text('One-Time Credentials'), findsOneWidget);
        expect(
          find.text(
            'These credentials will only be shown once. Copy or share them now before closing.',
          ),
          findsOneWidget,
        );
        expect(find.text('Kasun Silva'), findsWidgets);
        expect(find.text('TM002'), findsOneWidget);
        expect(find.text('TempPassword123!'), findsOneWidget);

        // Verify individual copy and share action icon buttons exist
        expect(find.byIcon(Icons.copy), findsWidgets);
        expect(find.byIcon(Icons.share), findsWidgets);

        // Tap individual copy icon
        await tester.tap(find.byIcon(Icons.copy).first);
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.textContaining('Auto-clearing in 30s'), findsOneWidget);

        // Tap Copy All button
        await tester.tap(find.text('Copy All'));
        await tester.pump(const Duration(milliseconds: 100));

        // Verify SnackBar with auto-clear notice is shown
        expect(find.textContaining('Auto-clearing in 30s'), findsOneWidget);

        // Dismiss modal with "I Have Saved Them"
        await tester.tap(find.text('I Have Saved Them'));
        await tester.pumpAndSettle();

        // Advance timer past 30 seconds so auto-clear executes cleanly
        await tester.pump(const Duration(seconds: 31));

        // Verify modal is dismissed
        expect(find.text('One-Time Credentials'), findsNothing);
      },
    );

    testWidgets(
      'Bulk account creation displays multi-credential ephemeral modal',
      (tester) async {
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/accounts' && request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'accounts': [
                  {
                    'id': 'acc-1',
                    'userCode': 'TM001',
                    'fullName': 'Kamal Silva',
                    'role': 'team_member',
                    'isActive': true,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/v1/accounts/bulk' &&
              request.method == 'POST') {
            return http.Response(
              jsonEncode({
                'users': [
                  {
                    'id': 'acc-bulk-1',
                    'userCode': 'TM003',
                    'fullName': 'Team Member 1',
                    'initialPassword': 'BulkPassword1!',
                  },
                  {
                    'id': 'acc-bulk-2',
                    'userCode': 'TM004',
                    'fullName': 'Team Member 2',
                    'initialPassword': 'BulkPassword2!',
                  },
                ],
              }),
              201,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(screen: const TeamMembersScreen(), httpClient: mockClient),
        );
        await tester.pumpAndSettle();

        // Tap Bulk Add button (icon: group_add_outlined)
        await tester.tap(find.byIcon(Icons.group_add_outlined));
        await tester.pumpAndSettle();

        // Dialog should be visible
        expect(find.text('Bulk Add Team Members'), findsOneWidget);

        // Tap Create Batch
        await tester.tap(find.widgetWithText(ElevatedButton, 'Create Batch'));
        await tester.pumpAndSettle();

        // Verify Ephemeral Credentials Modal displays both credentials
        expect(find.text('One-Time Credentials'), findsOneWidget);
        expect(find.text('TM003'), findsOneWidget);
        expect(find.text('BulkPassword1!'), findsOneWidget);
        expect(find.text('TM004'), findsOneWidget);
        expect(find.text('BulkPassword2!'), findsOneWidget);

        // Dismiss modal
        await tester.tap(find.text('I Have Saved Them'));
        await tester.pumpAndSettle();

        expect(find.text('One-Time Credentials'), findsNothing);
      },
    );
  });
}
