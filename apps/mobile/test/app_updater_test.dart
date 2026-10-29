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
}
