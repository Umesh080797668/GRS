import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:grs_core/grs_core.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import '../config/env.dart';

/// Progress callback for APK download:
/// [progress] is between 0.0 and 1.0 (or -1.0 if contentLength unknown).
/// [received] is bytes downloaded so far.
/// [total] is total bytes from Content-Length header.
typedef DownloadProgressCallback =
    void Function(double progress, int received, int total);

class AppUpdaterService {
  static const MethodChannel _channel = MethodChannel('lk.gov.grs/updater');
  final GrsApiClient _apiClient;
  final http.Client _httpClient;
  final Future<Directory> Function()? _tempDirProvider;

  AppUpdaterService({
    required GrsApiClient apiClient,
    http.Client? httpClient,
    Future<Directory> Function()? tempDirProvider,
  }) : _apiClient = apiClient,
       _httpClient = httpClient ?? http.Client(),
       _tempDirProvider = tempDirProvider;

  /// Compares [latestVersion] against [currentVersion] semantically.
  static bool isUpdateAvailable(String latestVersion, String currentVersion) {
    try {
      List<int> parse(String v) {
        final clean = v
            .split('+')
            .first
            .split('-')
            .first
            .replaceAll(RegExp(r'[^0-9.]'), '');
        return clean.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      }

      final latestParts = parse(latestVersion);
      final currentParts = parse(currentVersion);
      final maxLen = latestParts.length > currentParts.length
          ? latestParts.length
          : currentParts.length;

      for (int i = 0; i < maxLen; i++) {
        final l = i < latestParts.length ? latestParts[i] : 0;
        final c = i < currentParts.length ? currentParts[i] : 0;
        if (l > c) return true;
        if (l < c) return false;
      }
      return false;
    } catch (_) {
      return latestVersion.trim() != currentVersion.trim();
    }
  }

  /// Checks if the update is mandatory (e.g. if mandatory flag is set, or current version < minSupportedVersion).
  static bool isMandatory(AppReleaseModel release, String currentVersion) {
    if (release.mandatory) return true;
    return isUpdateAvailable(release.minSupportedVersion, currentVersion);
  }

  /// Fetches the latest published release from the backend with automatic fallback to GitHub Releases.
  Future<AppReleaseModel> fetchLatestRelease({String? currentVersion}) async {
    final version = currentVersion ?? AppEnv.appVersion;
    try {
      return await _apiClient.getLatestRelease(currentVersion: version);
    } catch (e) {
      // If backend fails (e.g. 404 RELEASE_NOT_FOUND or connection failure),
      // query GitHub Releases directly
      try {
        final ghRelease = await _fetchFromGitHub();
        if (ghRelease != null) {
          return ghRelease;
        }
      } catch (_) {}
      rethrow;
    }
  }

  /// Directly queries GitHub Releases API for the latest release asset
  Future<AppReleaseModel?> _fetchFromGitHub() async {
    try {
      final uri = Uri.parse(
        'https://api.github.com/repos/Umesh080797668/GRS/releases/latest',
      );
      final response = await _httpClient.get(
        uri,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GRS-Mobile-Updater',
        },
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final tagName = data['tag_name'] as String? ?? '1.0.0';
        final cleanVersion = tagName.replaceFirst(RegExp(r'^v'), '');
        final rawAssets = data['assets'];
        final assets = rawAssets is List
            ? rawAssets.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];

        // 1. Check if manifest.json asset exists
        for (final a in assets) {
          if (a['name'] == 'manifest.json' &&
              a['browser_download_url'] != null) {
            try {
              final mRes = await _httpClient.get(
                Uri.parse(a['browser_download_url'] as String),
              );
              if (mRes.statusCode >= 200 && mRes.statusCode < 300) {
                final mData = jsonDecode(mRes.body) as Map<String, dynamic>;
                return AppReleaseModel.fromJson(mData);
              }
            } catch (_) {}
          }
        }

        // 2. Otherwise parse directly from GitHub release object
        String apkUrl = '';
        int? fileSize;
        String checksum = '';

        for (final a in assets) {
          final name = a['name'] as String? ?? '';
          if (name.endsWith('.apk')) {
            apkUrl = a['browser_download_url'] as String? ?? '';
            fileSize = a['size'] as int?;
            final digest = a['digest'] as String? ?? '';
            if (digest.startsWith('sha256:')) {
              checksum = digest.replaceFirst('sha256:', '');
            }
          }
        }

        final body = data['body'] as String?;
        final publishedAt = data['published_at'] != null
            ? DateTime.tryParse(data['published_at'].toString())
            : null;

        return AppReleaseModel(
          version: cleanVersion,
          minSupportedVersion: '1.0.0',
          apkUrl: apkUrl,
          checksum: checksum,
          fileSize: fileSize,
          releaseNotes: body,
          releasedAt: publishedAt,
          mandatory: false,
        );
      }
    } catch (_) {}
    return null;
  }

  /// Checks if a newer release exists compared to current [AppEnv.appVersion].
  Future<AppReleaseModel?> checkForUpdate({String? currentVersion}) async {
    final version = currentVersion ?? AppEnv.appVersion;
    final release = await fetchLatestRelease(currentVersion: version);
    if (isUpdateAvailable(release.version, version)) {
      return release;
    }
    return null;
  }

  /// Downloads the release APK with real-time download progress.
  /// Follows 302 redirects (e.g. Vercel -> GitHub Releases) and validates SHA-256 checksum.
  Future<File> downloadApk(
    AppReleaseModel release, {
    DownloadProgressCallback? onProgress,
  }) async {
    // Resolve download URL (direct GitHub release asset or server endpoint)
    Uri downloadUri;
    if (release.apkUrl.startsWith('http://') ||
        release.apkUrl.startsWith('https://')) {
      downloadUri = Uri.parse(release.apkUrl);
    } else {
      final cleanBase = _apiClient.baseUrl.replaceAll(RegExp(r'/+$'), '');
      final cleanPath = release.apkUrl.startsWith('/')
          ? release.apkUrl
          : '/${release.apkUrl}';
      downloadUri = Uri.parse('$cleanBase$cleanPath');
    }

    final request = http.Request('GET', downloadUri);
    request.followRedirects = true;
    request.maxRedirects = 5;
    request.headers['Accept'] =
        'application/vnd.android.package-archive, application/octet-stream, */*';
    request.headers['X-App-Version'] = AppEnv.appVersion;

    final streamedResponse = await _httpClient.send(request);

    if (streamedResponse.statusCode < 200 ||
        streamedResponse.statusCode >= 300) {
      throw Exception(
        'Failed to download update: HTTP ${streamedResponse.statusCode}',
      );
    }

    final totalBytes = streamedResponse.contentLength ?? -1;
    final tempDir = await (_tempDirProvider?.call() ?? getTemporaryDirectory());
    final fileName = 'grs-release-${release.version.replaceAll('/', '_')}.apk';
    final targetFile = File('${tempDir.path}/$fileName');

    if (await targetFile.exists()) {
      await targetFile.delete();
    }

    final sink = targetFile.openWrite();
    int receivedBytes = 0;

    try {
      await for (final chunk in streamedResponse.stream) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        if (onProgress != null) {
          final progress = totalBytes > 0 ? (receivedBytes / totalBytes) : -1.0;
          onProgress(progress, receivedBytes, totalBytes);
        }
      }
    } finally {
      await sink.flush();
      await sink.close();
    }

    // Verify SHA-256 if provided by release metadata
    if (release.checksum.isNotEmpty) {
      final digest = await sha256.bind(targetFile.openRead()).first;
      final fileChecksum = digest.toString().toLowerCase();
      final expectedChecksum = release.checksum.trim().toLowerCase();
      if (fileChecksum != expectedChecksum) {
        await targetFile.delete();
        throw Exception(
          'Update checksum verification failed. Expected $expectedChecksum, got $fileChecksum',
        );
      }
    }

    return targetFile;
  }

  /// Triggers the native Android package installer to install the downloaded APK.
  Future<bool> installApk(File apkFile) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError(
        'APK installation is only supported on Android devices.',
      );
    }

    if (!await apkFile.exists()) {
      throw FileSystemException('APK file not found', apkFile.path);
    }

    try {
      final result = await _channel.invokeMethod<bool>('installApk', {
        'filePath': apkFile.path,
      });
      return result ?? true;
    } on PlatformException catch (e) {
      throw Exception('Failed to invoke package installer: ${e.message}');
    }
  }
}
