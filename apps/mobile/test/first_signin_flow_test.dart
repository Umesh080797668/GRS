import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/local/secure_storage_service.dart';
import 'package:mobile/providers/auth_provider.dart';

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
  group('First Sign-in Flow & Invariant 14 Tests (M2.5)', () {
    test(
      'Wrong ID and wrong password produce identical uniform error (Invariant 14)',
      () async {
        // API returns uniform failure: 401 AUTH_FAILED / auth.invalid_credentials
        final mockClient = MockClient((request) async {
          return http.Response(
            jsonEncode({
              'code': 'AUTH_FAILED',
              'message_key': 'auth.invalid_credentials',
              'details': {},
            }),
            401,
            headers: {'content-type': 'application/json'},
          );
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final storage = FakeSecureStorageService();
        final notifier = AuthNotifier(apiClient: apiClient, storage: storage);

        // Attempt 1: Non-existent ID
        await notifier.login('GRS9999999999', 'AnyPassword123!');
        final stateWrongId = notifier.state;

        // Attempt 2: Valid ID with wrong password
        await notifier.login('GRS0123456789', 'WrongPassword!');
        final stateWrongPassword = notifier.state;

        // Invariant 14: Must be completely indistinguishable to prevent enumeration
        expect(stateWrongId.status, equals(AuthStatus.unauthenticated));
        expect(stateWrongPassword.status, equals(AuthStatus.unauthenticated));
        expect(
          stateWrongId.errorMessage,
          equals(stateWrongPassword.errorMessage),
        );
        expect(
          stateWrongId.errorMessage,
          equals('Invalid user code, email, or password'),
        );
      },
    );

    test(
      'First sign-in with mustChangePassword=true redirects to forced change password',
      () async {
        final mockClient = MockClient((request) async {
          return http.Response(
            jsonEncode({
              'accessToken': 'temp-token',
              'refreshToken': 'temp-refresh-token',
              'expiresIn': 900,
              'mustChangePassword': true,
              'profile': {
                'id': 'user-101',
                'userCode': 'GRS0123456789',
                'role': 'team_member',
                'fullName': 'Kasun Silva',
                'preferredLanguage': 'si',
                'isActive': true,
                'mustChangePassword': true,
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final storage = FakeSecureStorageService();
        final notifier = AuthNotifier(apiClient: apiClient, storage: storage);

        await notifier.login('GRS0123456789', 'InitialRandomPass1!');

        expect(notifier.state.status, equals(AuthStatus.mustChangePassword));
        expect(notifier.state.profile?.userCode, equals('GRS0123456789'));
        expect(notifier.state.profile?.mustChangePassword, isTrue);
      },
    );

    test(
      'Changing password updates credentials and transitions to optional add email',
      () async {
        final mockClient = MockClient((request) async {
          if (request.url.path.endsWith('/change-password')) {
            return http.Response(
              jsonEncode({
                'accessToken': 'new-full-access-token',
                'refreshToken': 'new-refresh-token',
                'expiresIn': 900,
                'mustChangePassword': false,
                'profile': {
                  'id': 'user-101',
                  'userCode': 'GRS0123456789',
                  'role': 'team_member',
                  'fullName': 'Kasun Silva',
                  'preferredLanguage': 'si',
                  'isActive': true,
                  'mustChangePassword': false,
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        });

        final apiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );
        final storage = FakeSecureStorageService();
        final notifier = AuthNotifier(apiClient: apiClient, storage: storage);

        await notifier.changePassword(
          'InitialRandomPass1!',
          'NewSecurePass@2026',
        );

        expect(notifier.state.status, equals(AuthStatus.addEmailOptional));
        expect(notifier.state.profile?.mustChangePassword, isFalse);

        // User skips optional email -> transitions to fully authenticated
        notifier.skipAddEmail();
        expect(notifier.state.status, equals(AuthStatus.authenticated));
      },
    );
  });
}
