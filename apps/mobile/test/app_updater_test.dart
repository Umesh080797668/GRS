import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/app_updater_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AppUpdaterService Version Comparison Tests', () {
    test('isUpdateAvailable correctly identifies newer versions', () {
      expect(AppUpdaterService.isUpdateAvailable('1.0.1', '1.0.0'), isTrue);
      expect(AppUpdaterService.isUpdateAvailable('1.1.0', '1.0.9'), isTrue);
      expect(AppUpdaterService.isUpdateAvailable('2.0.0', '1.99.99'), isTrue);
      expect(AppUpdaterService.isUpdateAvailable('1.0.10', '1.0.9'), isTrue);
    });

    test('isUpdateAvailable returns false for same or older versions', () {
      expect(AppUpdaterService.isUpdateAvailable('1.0.0', '1.0.0'), isFalse);
      expect(AppUpdaterService.isUpdateAvailable('1.0.0', '1.0.1'), isFalse);
      expect(AppUpdaterService.isUpdateAvailable('1.0.9', '1.1.0'), isFalse);
    });

    test('isUpdateAvailable handles build suffixes cleanly', () {
      expect(AppUpdaterService.isUpdateAvailable('1.0.1+2', '1.0.0+1'), isTrue);
      expect(
        AppUpdaterService.isUpdateAvailable('1.0.0+2', '1.0.0+1'),
        isFalse,
      );
    });

    test('isMandatory evaluates mandatory flag and minSupportedVersion', () {
      const release1 = AppReleaseModel(
        version: '1.0.2',
        minSupportedVersion: '1.0.0',
        apkUrl:
            'https://github.com/Umesh080797668/GRS/releases/download/v1.0.2/app-release.apk',
        checksum: 'abc',
        mandatory: true,
      );
      expect(AppUpdaterService.isMandatory(release1, '1.0.1'), isTrue);

      const release2 = AppReleaseModel(
        version: '1.1.0',
        minSupportedVersion: '1.1.0',
        apkUrl:
            'https://github.com/Umesh080797668/GRS/releases/download/v1.1.0/app-release.apk',
        checksum: 'abc',
        mandatory: false,
      );
      expect(AppUpdaterService.isMandatory(release2, '1.0.5'), isTrue);
      expect(AppUpdaterService.isMandatory(release2, '1.1.0'), isFalse);
    });
  });

  group('AppUpdaterService Download and Checksum Tests', () {
    late Directory tempDir;

    setUpAll(() async {
      tempDir = Directory.systemTemp.createTempSync('grs_updater_test_');
    });

    tearDownAll(() async {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    test(
      'downloadApk calculates progress and verifies valid SHA-256 checksum',
      () async {
        final sampleApkContent = utf8.encode(
          'SIMULATED_ANDROID_APK_BINARY_CONTENT_FOR_TESTING',
        );
        final expectedSha256 = sha256.convert(sampleApkContent).toString();

        final mockClient = MockClient((request) async {
          if (request.url.path.endsWith('/releases/download')) {
            return http.Response.bytes(
              sampleApkContent,
              200,
              headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Length': sampleApkContent.length.toString(),
              },
            );
          }
          return http.Response('Not Found', 404);
        });

        final apiClient = GrsApiClient(
          baseUrl: 'https://api.test.gov.lk',
          client: mockClient,
        );

        final updater = AppUpdaterService(
          apiClient: apiClient,
          httpClient: mockClient,
          tempDirProvider: () async => tempDir,
        );

        final release = AppReleaseModel(
          version: '1.0.1',
          minSupportedVersion: '1.0.0',
          apkUrl: '/v1/releases/download',
          checksum: expectedSha256,
        );

        double lastProgress = 0.0;
        int lastReceived = 0;
        int lastTotal = 0;

        final downloadedFile = await updater.downloadApk(
          release,
          onProgress: (progress, received, total) {
            lastProgress = progress;
            lastReceived = received;
            lastTotal = total;
          },
        );

        expect(downloadedFile.existsSync(), isTrue);
        expect(downloadedFile.lengthSync(), sampleApkContent.length);
        expect(lastProgress, 1.0);
        expect(lastReceived, sampleApkContent.length);
        expect(lastTotal, sampleApkContent.length);

        // Clean up downloaded file
        await downloadedFile.delete();
      },
    );

    test(
      'downloadApk rejects file if SHA-256 checksum does not match',
      () async {
        final sampleApkContent = utf8.encode('CORRUPTED_OR_TAMPERED_APK_DATA');
        final wrongSha256 =
            '0000000000000000000000000000000000000000000000000000000000000000';

        final mockClient = MockClient((request) async {
          return http.Response.bytes(
            sampleApkContent,
            200,
            headers: {'Content-Length': sampleApkContent.length.toString()},
          );
        });

        final apiClient = GrsApiClient(
          baseUrl: 'https://api.test.gov.lk',
          client: mockClient,
        );

        final updater = AppUpdaterService(
          apiClient: apiClient,
          httpClient: mockClient,
          tempDirProvider: () async => tempDir,
        );

        final release = AppReleaseModel(
          version: '1.0.1',
          minSupportedVersion: '1.0.0',
          apkUrl: 'https://api.test.gov.lk/v1/releases/download',
          checksum: wrongSha256,
        );

        expect(
          () => updater.downloadApk(release),
          throwsA(
            isA<Exception>().having(
              (e) => e.toString(),
              'error',
              contains('Update checksum verification failed'),
            ),
          ),
        );
      },
    );

    test('downloadApk rejects release if checksum is missing', () async {
      final mockClient = MockClient((request) async {
        return http.Response('OK', 200);
      });
      final apiClient = GrsApiClient(
        baseUrl: 'https://api.test.gov.lk',
        client: mockClient,
      );
      final updater = AppUpdaterService(
        apiClient: apiClient,
        httpClient: mockClient,
        tempDirProvider: () async => tempDir,
      );
      const release = AppReleaseModel(
        version: '1.0.1',
        minSupportedVersion: '1.0.0',
        apkUrl: '/v1/releases/download',
        checksum: '',
      );

      expect(
        () => updater.downloadApk(release),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'error',
            contains('release checksum is required'),
          ),
        ),
      );
    });

    test('downloadApk rejects download from untrusted host', () async {
      final mockClient = MockClient((request) async {
        return http.Response('OK', 200);
      });
      final apiClient = GrsApiClient(
        baseUrl: 'https://api.test.gov.lk',
        client: mockClient,
      );
      final updater = AppUpdaterService(
        apiClient: apiClient,
        httpClient: mockClient,
        tempDirProvider: () async => tempDir,
      );
      const release = AppReleaseModel(
        version: '1.0.1',
        minSupportedVersion: '1.0.0',
        apkUrl: 'https://evil-untrusted-server.com/malicious.apk',
        checksum:
            '46e0e620269583782342988b3c22993420a17dd743820873e7be3432c3ae08ea',
      );

      expect(
        () => updater.downloadApk(release),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'error',
            contains('Untrusted download host'),
          ),
        ),
      );
    });
  });

  group('AppUpdaterService Backend API and In-Memory Caching Tests', () {
    test('fetches latest release from backend API and caches response', () async {
      int apiCallCount = 0;
      final mockClient = MockClient((request) async {
        if (request.url.path.contains('/v1/releases/latest')) {
          apiCallCount++;
          return http.Response(
            jsonEncode({
              'version': '1.1.0',
              'minSupportedVersion': '1.0.0',
              'apkUrl': 'https://api.test.gov.lk/v1/releases/download',
              'sha256':
                  '46e0e620269583782342988b3c22993420a17dd743820873e7be3432c3ae08ea',
              'checksum':
                  '46e0e620269583782342988b3c22993420a17dd743820873e7be3432c3ae08ea',
              'releaseNotes': 'Automated release build for v1.1.0',
              'mandatory': false,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = GrsApiClient(
        baseUrl: 'https://api.test.gov.lk',
        client: mockClient,
      );

      final updater = AppUpdaterService(
        apiClient: apiClient,
        httpClient: mockClient,
      );

      // First fetch hits the backend API
      final release1 = await updater.fetchLatestRelease(
        currentVersion: '1.0.0',
      );
      expect(release1.version, '1.1.0');
      expect(
        release1.checksum,
        '46e0e620269583782342988b3c22993420a17dd743820873e7be3432c3ae08ea',
      );
      expect(apiCallCount, 1);

      // Second fetch within cache TTL uses cached release without network call
      final release2 = await updater.fetchLatestRelease(
        currentVersion: '1.0.0',
      );
      expect(release2.version, '1.1.0');
      expect(apiCallCount, 1);

      // Force refresh bypasses cache
      final release3 = await updater.fetchLatestRelease(
        currentVersion: '1.0.0',
        forceRefresh: true,
      );
      expect(release3.version, '1.1.0');
      expect(apiCallCount, 2);
    });
  });
}
