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
  });
}
