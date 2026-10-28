import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/local/secure_storage_service.dart';
import 'package:mobile/providers/auth_provider.dart';

// Test double for SecureStorageService using in-memory map
class FakeSecureStorageService extends SecureStorageService {
  final Map<String, String> _data = {};

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _data['grs_access_token'] = accessToken;
    _data['grs_refresh_token'] = refreshToken;
  }

  @override
  Future<String?> getAccessToken() async => _data['grs_access_token'];

  @override
  Future<String?> getRefreshToken() async => _data['grs_refresh_token'];

  @override
  Future<void> saveActiveProfile(ProfileModel profile) async {
    _data['grs_active_profile'] = jsonEncode(profile.toJson());
  }

  @override
  Future<ProfileModel?> getActiveProfile() async {
    final str = _data['grs_active_profile'];
    if (str == null) return null;
    return ProfileModel.fromJson(jsonDecode(str) as Map<String, dynamic>);
  }

  @override
  Future<void> clearTokens() async {
    _data.remove('grs_access_token');
    _data.remove('grs_refresh_token');
  }
}

void main() {
  group('Session Handling & Cold Start Tests (M2.6)', () {
    const activeProfile = ProfileModel(
      id: 'agent-001',
      userCode: 'GRS0123456789',
      role: 'team_member',
      fullName: 'Sunil Silva',
      preferredLanguage: 'si',
      teamId: 'team-01',
      isActive: true,
      mustChangePassword: false,
    );

    test(
      'Airplane-mode cold start opens the app with local profile (M2.6 Done When)',
      () async {
        // Network throws SocketException / offline simulation
        final mockClient = MockClient((request) async {
          throw http.ClientException('Network unreachable (Airplane Mode)');
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final fakeStorage = FakeSecureStorageService();

        // Pre-condition: User previously logged in and profile saved
        await fakeStorage.saveActiveProfile(activeProfile);
        await fakeStorage.saveTokens(
          accessToken: 'expired-access-token',
          refreshToken: 'valid-refresh-token',
        );

        final notifier = AuthNotifier(
          apiClient: apiClient,
          storage: fakeStorage,
        );

        // Perform cold start
        await notifier.checkColdStart();

        // Non-negotiable Invariant 1 & M2.6: App MUST open to authenticated home screen in offline mode
        expect(notifier.state.status, equals(AuthStatus.authenticated));
        expect(notifier.state.isOffline, isTrue);
        expect(notifier.state.profile?.userCode, equals('GRS0123456789'));
        expect(notifier.state.profile?.fullName, equals('Sunil Silva'));
      },
    );

    test(
      'HTTP 426 triggers version gate screen and blocks usage (Invariant 8.2 #10)',
      () async {
        final mockClient = MockClient((request) async {
          return http.Response(
            jsonEncode({
              'code': 'UPGRADE_REQUIRED',
              'message_key': 'error.upgrade_required',
              'details': {'min_version': '1.3.0'},
            }),
            426,
            headers: {'content-type': 'application/json'},
          );
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final fakeStorage = FakeSecureStorageService();
        await fakeStorage.saveActiveProfile(activeProfile);
        await fakeStorage.saveTokens(
          accessToken: 'some-token',
          refreshToken: 'some-refresh-token',
        );

        final notifier = AuthNotifier(
          apiClient: apiClient,
          storage: fakeStorage,
        );
        await notifier.checkColdStart();

        expect(notifier.state.status, equals(AuthStatus.versionGate));
        expect(notifier.state.minVersionRequired, equals('1.3.0'));
      },
    );

    test(
      'Deactivated profile triggers deactivation guard screen (Invariant 8.2 #11)',
      () async {
        const deactivatedProfile = ProfileModel(
          id: 'agent-001',
          userCode: 'GRS0123456789',
          role: 'team_member',
          fullName: 'Sunil Silva',
          preferredLanguage: 'si',
          isActive: false, // Inactive
          mustChangePassword: false,
        );

        final mockClient = MockClient(
          (request) async => http.Response('{}', 200),
        );
        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final fakeStorage = FakeSecureStorageService();
        await fakeStorage.saveActiveProfile(deactivatedProfile);

        final notifier = AuthNotifier(
          apiClient: apiClient,
          storage: fakeStorage,
        );
        await notifier.checkColdStart();

        expect(notifier.state.status, equals(AuthStatus.deactivated));
      },
    );

    test(
      'Session handles expired access token by automatically refreshing and retrying (M2.6 Done When)',
      () async {
        int requestCount = 0;
        final fakeStorage = FakeSecureStorageService();
        await fakeStorage.saveTokens(
          accessToken: 'expired-access-token',
          refreshToken: 'valid-refresh-token',
        );

        final mockHttpClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/refresh') {
            return http.Response(
              jsonEncode({
                'accessToken': 'fresh-new-access-token',
                'refreshToken': 'fresh-new-refresh-token',
                'profile': activeProfile.toJson(),
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }

          if (request.url.path == '/v1/sync/area') {
            requestCount++;
            if (request.headers['authorization'] ==
                'Bearer expired-access-token') {
              // First attempt with expired token fails with HTTP 401
              return http.Response(
                jsonEncode({
                  'code': 'TOKEN_EXPIRED',
                  'message_key': 'error.token_expired',
                }),
                401,
                headers: {'content-type': 'application/json'},
              );
            } else if (request.headers['authorization'] ==
                'Bearer fresh-new-access-token') {
              // Retried attempt with refreshed token succeeds
              return http.Response(
                jsonEncode({
                  'items': [],
                  'nextCursor': null,
                  'hasMore': false,
                  'total': 0,
                }),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
          }
          return http.Response('Not Found', 404);
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockHttpClient,
          onTokenRefreshed: (newAccess, newRefresh) async {
            await fakeStorage.saveTokens(
              accessToken: newAccess,
              refreshToken: newRefresh,
            );
          },
        );
        apiClient.setTokens(
          accessToken: await fakeStorage.getAccessToken(),
          refreshToken: await fakeStorage.getRefreshToken(),
        );

        // Make an authenticated call with the expired token
        final result = await apiClient.downloadArea();

        // Verify request was retried and succeeded
        expect(result.items, isEmpty);
        expect(requestCount, equals(2)); // Attempt 1 (401) + Attempt 2 (200)

        // Verify storage received the updated tokens
        expect(
          await fakeStorage.getAccessToken(),
          equals('fresh-new-access-token'),
        );
        expect(
          await fakeStorage.getRefreshToken(),
          equals('fresh-new-refresh-token'),
        );
      },
    );
  });
}
