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
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/providers/permission_provider.dart';
import 'package:mobile/router/app_router.dart';
import 'package:mobile/services/permission_service.dart';

class _FakePermissionService extends PermissionService {
  @override
  Future<bool> arePermissionsGranted() async => true;
  @override
  Future<bool> hasPermanentlyDeniedPermissions() async => false;
}

class _FakeSecureStorageService extends SecureStorageService {
  @override
  Future<String?> getAccessToken() async => 'test-jwt';
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

  group('Level 4 Route Guard Tests', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;

    const level4Routes = [
      '/houses/new',
      '/gn-setup',
      '/choose-houses',
      '/team-members',
      '/team-progress',
      '/team-records',
      '/team-duplicates',
    ];

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('router_guard_test_');
      dbFile = File('${tempDir.path}/test_guard.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: '0123456789abcdef0123456789abcdef',
        requireCipher: false,
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    for (final route in level4Routes) {
      testWidgets('redirects team_member from $route to /home', (tester) async {
        tester.view.physicalSize = const Size(1200, 2400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockClient = MockClient((request) async {
          return http.Response(
            jsonEncode({}),
            200,
            headers: {'content-type': 'application/json'},
          );
        });

        const teamMemberProfile = ProfileModel(
          id: 'u-tm-1',
          userCode: 'TM001',
          role: 'team_member',
          fullName: 'Team Member 1',
          preferredLanguage: 'en',
          teamId: 'team-1',
          isActive: true,
          mustChangePassword: false,
        );

        final container = ProviderContainer(
          overrides: [
            databaseProvider.overrideWith((ref) async => db),
            apiClientProvider.overrideWithValue(
              GrsApiClient(
                baseUrl: 'http://localhost:3000',
                client: mockClient,
              ),
            ),
            permissionServiceProvider.overrideWithValue(
              _FakePermissionService(),
            ),
            permissionGateProvider.overrideWith(
              (ref) => PermissionGateNotifier(_FakePermissionService())
                ..state = const PermissionGateState(
                  isGranted: true,
                  isChecking: false,
                ),
            ),
            authProvider.overrideWith(
              (ref) => AuthNotifier(
                apiClient: GrsApiClient(
                  baseUrl: 'http://localhost:3000',
                  client: mockClient,
                ),
                storage: _FakeSecureStorageService(),
                initialState: const AuthState(
                  status: AuthStatus.authenticated,
                  profile: teamMemberProfile,
                  isOffline: false,
                ),
              ),
            ),
          ],
        );
        addTearDown(container.dispose);

        final router = container.read(routerProvider);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp.router(
              routerConfig: router,
              locale: const Locale('en'),
              localizationsDelegates: const [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Attempt navigating to Level 4 route
        router.go(route);
        await tester.pumpAndSettle();

        // Must be redirected to /home because caller is team_member
        expect(router.state.matchedLocation, '/home');
      });
    }

    testWidgets(
      'allows cdc_secretary to access /team-members without redirection',
      (tester) async {
        tester.view.physicalSize = const Size(1200, 2400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/accounts') {
            return http.Response(
              jsonEncode({'accounts': []}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode({}),
            200,
            headers: {'content-type': 'application/json'},
          );
        });

        const secretaryProfile = ProfileModel(
          id: 'u-sec-1',
          userCode: 'SEC001',
          role: 'cdc_secretary',
          fullName: 'Secretary 1',
          preferredLanguage: 'en',
          teamId: 'team-1',
          gnId: 'gn-1',
          isActive: true,
          mustChangePassword: false,
        );

        final container = ProviderContainer(
          overrides: [
            databaseProvider.overrideWith((ref) async => db),
            apiClientProvider.overrideWithValue(
              GrsApiClient(
                baseUrl: 'http://localhost:3000',
                client: mockClient,
              ),
            ),
            permissionServiceProvider.overrideWithValue(
              _FakePermissionService(),
            ),
            permissionGateProvider.overrideWith(
              (ref) => PermissionGateNotifier(_FakePermissionService())
                ..state = const PermissionGateState(
                  isGranted: true,
                  isChecking: false,
                ),
            ),
            authProvider.overrideWith(
              (ref) => AuthNotifier(
                apiClient: GrsApiClient(
                  baseUrl: 'http://localhost:3000',
                  client: mockClient,
                ),
                storage: _FakeSecureStorageService(),
                initialState: const AuthState(
                  status: AuthStatus.authenticated,
                  profile: secretaryProfile,
                  isOffline: false,
                ),
              ),
            ),
          ],
        );
        addTearDown(container.dispose);

        final router = container.read(routerProvider);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp.router(
              routerConfig: router,
              locale: const Locale('en'),
              localizationsDelegates: const [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();

        router.go('/team-members');
        await tester.pumpAndSettle();

        expect(router.state.matchedLocation, '/team-members');
      },
    );
  });
}
