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
  });

  group('AppUpdaterService GitHub Releases Fallback Tests', () {
    test('falls back to GitHub Releases when backend reports 404', () async {
      final mockClient = MockClient((request) async {
        if (request.url.host == 'api.test.gov.lk') {
          return http.Response(
            jsonEncode({
              'code': 'RELEASE_NOT_FOUND',
              'message': 'Release not found',
            }),
            404,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.host == 'api.github.com') {
          return http.Response(
            jsonEncode({
              'tag_name': 'v1.1.0',
              'body': 'Automated release build for v1.1.0',
              'published_at': '2026-10-30T11:54:48Z',
              'assets': [
                {
                  'name': 'app-release.apk',
                  'browser_download_url':
                      'https://github.com/Umesh080797668/GRS/releases/download/v1.1.0/app-release.apk',
                  'size': 71213132,
                  'digest':
                      'sha256:46e0e620269583782342988b3c22993420a17dd743820873e7be3432c3ae08ea',
                },
              ],
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

      final release = await updater.fetchLatestRelease(currentVersion: '1.0.0');
      expect(release.version, '1.1.0');
      expect(release.apkUrl, contains('v1.1.0/app-release.apk'));
      expect(
        AppUpdaterService.isUpdateAvailable(release.version, '1.0.0'),
        isTrue,
      );
      expect(
        AppUpdaterService.isUpdateAvailable(release.version, '1.1.0'),
        isFalse,
      );
    });
  });
}
