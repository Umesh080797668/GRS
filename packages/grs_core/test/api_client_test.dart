import 'dart:convert';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
  group('GrsApiClient Tests', () {
    test('Login success returns tokens and profile', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/v1/auth/login'));
        expect(request.method, equals('POST'));
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['identifier'], equals('GRS0123456789'));

        return http.Response(
          jsonEncode({
            'accessToken': 'test-access-token',
            'refreshToken': 'test-refresh-token',
            'expiresIn': 900,
            'mustChangePassword': true,
            'profile': {
              'id': 'user-1',
              'userCode': 'GRS0123456789',
              'email': 'agent@example.com',
              'role': 'team_member',
              'fullName': 'Test Agent',
              'preferredLanguage': 'si',
              'isActive': true,
              'mustChangePassword': true,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
      );

      final res = await client.login(
        const LoginRequest(
          identifier: 'GRS0123456789',
          password: 'Password123!',
          deviceId: 'dev-1',
        ),
      );

      expect(res.accessToken, equals('test-access-token'));
      expect(res.mustChangePassword, isTrue);
      expect(res.profile.fullName, equals('Test Agent'));
      expect(client.accessToken, equals('test-access-token'));
    });

    test(
      'Login failure throws GrsApiException with mapped code and messageKey',
      () async {
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

        final client = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );

        try {
          await client.login(
            const LoginRequest(
              identifier: 'wrong-user',
              password: 'wrong-password',
              deviceId: 'dev-1',
            ),
          );
          fail('Should throw GrsApiException');
        } on GrsApiException catch (e) {
          expect(e.statusCode, equals(401));
          expect(e.isUnauthorized, isTrue);
          expect(e.code, equals('AUTH_FAILED'));
          expect(e.messageKey, equals('auth.invalid_credentials'));
        }
      },
    );

    test('HTTP 426 Upgrade Required throws version gate exception', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'code': 'UPGRADE_REQUIRED',
            'message_key': 'error.upgrade_required',
            'details': {'min_version': '1.2.0'},
          }),
          426,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
      );

      try {
        await client.getConfig();
        fail('Should throw GrsApiException');
      } on GrsApiException catch (e) {
        expect(e.statusCode, equals(426));
        expect(e.isVersionGate, isTrue);
        expect(e.details['min_version'], equals('1.2.0'));
      }
    });

    test('HTTP 429 Rate Limited captures Retry-After header', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'code': 'TOO_MANY_REQUESTS',
            'message_key': 'error.rate_limit',
          }),
          429,
          headers: {'content-type': 'application/json', 'retry-after': '60'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
      );

      try {
        await client.getConfig();
        fail('Should throw GrsApiException');
      } on GrsApiException catch (e) {
        expect(e.statusCode, equals(429));
        expect(e.isRateLimited, isTrue);
        expect(e.retryAfterSeconds, equals(60));
      }
    });

    test('Sync Push sends payload and receives results', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/v1/sync/push'));
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['device_id'], equals('dev-001'));
        expect(body['records'], isNotEmpty);

        return http.Response(
          jsonEncode({
            'results': [
              {'id': 'rec-1', 'status': 'ok', 'server_version': 1},
              {
                'id': 'rec-2',
                'status': 'rejected',
                'code': 'VALIDATION_FAILED',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
        accessToken: 'valid-token',
      );

      final res = await client.pushSync(
        SyncPushRequest(
          deviceId: 'dev-001',
          appVersion: '1.0.0',
          records: [
            SyncRecordPayload(
              id: 'rec-1',
              baseVersion: 0,
              clientUpdatedAt: DateTime.now(),
              data: {'name': 'Kamal Perera'},
            ),
          ],
        ),
      );

      expect(res.results.length, equals(2));
      expect(res.results[0].isOk, isTrue);
      expect(res.results[0].serverVersion, equals(1));
      expect(res.results[1].isRejected, isTrue);
      expect(res.results[1].code, equals('VALIDATION_FAILED'));
    });

    test('downloadArea returns paged households and lookups', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/v1/sync/area'));
        expect(request.url.queryParameters['limit'], equals('500'));
        return http.Response(
          jsonEncode({
            'items': [
              {
                'id': 'h-1',
                'districtId': 'd-1',
                'dsId': 'ds-1',
                'gnId': 'gn-1',
                'serialNo': 1,
                'houseNo': '10A',
                'houseLeaderName': 'Perera',
                'createdAt': DateTime.now().toIso8601String(),
                'updatedAt': DateTime.now().toIso8601String(),
              },
            ],
            'nextCursor': null,
            'hasMore': false,
            'total': 1,
            'lookups': {'gender': []},
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
        accessToken: 'valid-token',
      );

      final res = await client.downloadArea();
      expect(res.items.length, equals(1));
      expect(res.items.first.houseNo, equals('10A'));
      expect(res.hasMore, isFalse);
      expect(res.lookups, isNotNull);
    });

    test('forgotPassword and resetPassword succeed', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/v1/auth/forgot') {
          return http.Response(jsonEncode({'message': 'Code sent'}), 200);
        }
        if (request.url.path == '/v1/auth/reset') {
          return http.Response(jsonEncode({'message': 'Password reset'}), 200);
        }
        return http.Response('Not Found', 404);
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
      );

      await expectLater(client.forgotPassword('agent@example.com'), completes);
      await expectLater(
        client.resetPassword(
          email: 'agent@example.com',
          code: '123456',
          newPassword: 'NewPassword123!',
        ),
        completes,
      );
    });

    test('updateProfile sends language preference to server', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/v1/auth/profile'));
        expect(request.method, equals('PATCH'));
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['preferredLanguage'], equals('ta'));

        return http.Response(
          jsonEncode({
            'id': 'u-1',
            'userCode': 'GRS001',
            'role': 'team_member',
            'fullName': 'Agent Tamil',
            'preferredLanguage': 'ta',
            'isActive': true,
            'mustChangePassword': false,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: mockClient,
        accessToken: 'valid-token',
      );

      final updated = await client.updateProfile(preferredLanguage: 'ta');
      expect(updated.preferredLanguage, equals('ta'));
    });

    test(
      '401 expired access token triggers automatic session refresh and request retry',
      () async {
        int getLookupsCalls = 0;
        int refreshCalls = 0;

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/refresh') {
            refreshCalls++;
            return http.Response(
              jsonEncode({
                'accessToken': 'new-fresh-token',
                'refreshToken': 'new-refresh-token',
                'expiresIn': 900,
                'mustChangePassword': false,
                'profile': {
                  'id': 'user-1',
                  'userCode': 'GRS001',
                  'role': 'team_member',
                  'fullName': 'Agent',
                  'preferredLanguage': 'en',
                  'isActive': true,
                  'mustChangePassword': false,
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }

          if (request.url.path == '/v1/lookups') {
            getLookupsCalls++;
            if (getLookupsCalls == 1) {
              // Expired token response on first try
              return http.Response(
                jsonEncode({
                  'code': 'UNAUTHORIZED',
                  'message': 'Token expired',
                }),
                401,
                headers: {'content-type': 'application/json'},
              );
            }
            // Second try with fresh token
            expect(
              request.headers['authorization'],
              equals('Bearer new-fresh-token'),
            );
            return http.Response(
              jsonEncode([
                {
                  'category': 'gender',
                  'code': 'F',
                  'labelEn': 'Female',
                  'labelSi': 'ස්ත්‍රී',
                  'labelTa': 'பெண்',
                  'sort': 1,
                  'isActive': true,
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }

          return http.Response('Not Found', 404);
        });

        final client = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
          accessToken: 'expired-token',
          refreshToken: 'valid-refresh-token',
        );

        final lookups = await client.getLookups();
        expect(lookups.length, equals(1));
        expect(getLookupsCalls, equals(2));
        expect(refreshCalls, equals(1));
        expect(client.accessToken, equals('new-fresh-token'));
      },
    );
  });
}
