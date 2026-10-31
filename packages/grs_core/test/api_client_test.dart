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

    test(
      'Concurrent 401 requests trigger only a single refreshSession call (single-flight deduplication)',
      () async {
        int refreshCalls = 0;
        int lookupCalls = 0;

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/refresh') {
            refreshCalls++;
            // Small artificial latency to simulate in-flight network call
            await Future.delayed(const Duration(milliseconds: 20));
            return http.Response(
              jsonEncode({
                'accessToken': 'single-flight-token',
                'refreshToken': 'new-refresh-token',
                'expiresIn': 900,
                'mustChangePassword': false,
                'profile': {
                  'id': 'u1',
                  'userCode': 'GRS1234567890',
                  'fullName': 'User 1',
                  'role': 'team_member',
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
            lookupCalls++;
            final authHeader = request.headers['authorization'] ?? '';
            if (!authHeader.contains('single-flight-token')) {
              return http.Response(
                jsonEncode({
                  'code': 'UNAUTHORIZED',
                  'message_key': 'errors.auth.invalid_token',
                }),
                401,
                headers: {'content-type': 'application/json'},
              );
            }
            return http.Response(
              jsonEncode([
                {
                  'category': 'gender',
                  'code': 'M',
                  'labelEn': 'Male',
                  'labelSi': 'පුරුෂ',
                  'labelTa': 'ஆண்',
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
          accessToken: 'stale-token',
          refreshToken: 'valid-refresh-token',
        );

        // Fire 3 parallel requests simultaneously
        final results = await Future.wait([
          client.getLookups(),
          client.getLookups(),
          client.getLookups(),
        ]);

        expect(results[0].length, equals(1));
        expect(results[1].length, equals(1));
        expect(results[2].length, equals(1));

        // Single-flight guarantee: Exactly 1 refresh call was made, NOT 3
        expect(refreshCalls, equals(1));
        expect(lookupCalls, greaterThanOrEqualTo(3));
        expect(client.accessToken, equals('single-flight-token'));
      },
    );

    test(
      'Direct concurrent refreshSession calls share the exact same in-flight Future',
      () async {
        int refreshNetworkCalls = 0;

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/refresh') {
            refreshNetworkCalls++;
            await Future.delayed(const Duration(milliseconds: 30));
            return http.Response(
              jsonEncode({
                'accessToken': 'shared-future-token',
                'refreshToken': 'shared-future-refresh',
                'expiresIn': 900,
                'mustChangePassword': false,
                'profile': {
                  'id': 'u1',
                  'userCode': 'GRS1234567890',
                  'fullName': 'User 1',
                  'role': 'team_member',
                  'preferredLanguage': 'en',
                  'isActive': true,
                  'mustChangePassword': false,
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        final client = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
          refreshToken: 'valid-refresh-token',
        );

        expect(client.isRefreshing, isFalse);

        // Fire 4 parallel direct refreshSession calls
        final future1 = client.refreshSession();
        expect(client.isRefreshing, isTrue);

        final future2 = client.refreshSession();
        final future3 = client.refreshSession();
        final future4 = client.refreshSession();

        final results = await Future.wait([future1, future2, future3, future4]);

        expect(client.isRefreshing, isFalse);
        expect(refreshNetworkCalls, equals(1));
        expect(results[0].accessToken, equals('shared-future-token'));
        expect(results[1].accessToken, equals('shared-future-token'));
        expect(results[2].accessToken, equals('shared-future-token'));
        expect(results[3].accessToken, equals('shared-future-token'));
        expect(client.accessToken, equals('shared-future-token'));
      },
    );

    test(
      'Requests dispatched while refresh is in-flight wait and use fresh token directly',
      () async {
        int refreshCalls = 0;
        int lookupCalls = 0;

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/refresh') {
            refreshCalls++;
            await Future.delayed(const Duration(milliseconds: 40));
            return http.Response(
              jsonEncode({
                'accessToken': 'awaited-fresh-token',
                'refreshToken': 'awaited-refresh-token',
                'expiresIn': 900,
                'mustChangePassword': false,
                'profile': {
                  'id': 'u1',
                  'userCode': 'GRS1234567890',
                  'fullName': 'User 1',
                  'role': 'team_member',
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
            lookupCalls++;
            final authHeader = request.headers['authorization'] ?? '';
            // If dispatched with old token, fail 401
            if (!authHeader.contains('awaited-fresh-token')) {
              return http.Response(
                jsonEncode({
                  'code': 'UNAUTHORIZED',
                  'message_key': 'errors.auth.invalid_token',
                }),
                401,
                headers: {'content-type': 'application/json'},
              );
            }
            // Fresh token succeeded on first try!
            return http.Response(
              jsonEncode([
                {
                  'category': 'gender',
                  'code': 'M',
                  'labelEn': 'Male',
                  'labelSi': 'පුරුෂ',
                  'labelTa': 'ஆண்',
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
          accessToken: 'old-stale-token',
          refreshToken: 'valid-refresh-token',
        );

        // Start a refresh
        final refreshFuture = client.refreshSession();

        // While refresh is in flight, dispatch an authenticated call
        final lookupFuture = client.getLookups();

        await Future.wait([refreshFuture, lookupFuture]);

        expect(refreshCalls, equals(1));
        // Crucial: getLookups waited for refresh to complete, so it used 'awaited-fresh-token'
        // on its very first attempt and succeeded immediately without a 401 retry loop!
        expect(lookupCalls, equals(1));
      },
    );
  });
}
