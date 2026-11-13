import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import '../config/api_endpoint_resolver.dart';
import '../config/env.dart';
import 'database_provider.dart';

export '../config/api_endpoint_resolver.dart';
export '../config/env.dart';

final apiBaseUrlProvider = StateProvider<String>((ref) {
  return ApiEndpointResolver.resolveDefault();
});

final apiClientProvider = Provider<GrsApiClient>((ref) {
  final rawUrl = ref.watch(apiBaseUrlProvider);
  final baseUrl = ApiEndpointResolver.sanitize(rawUrl);
  final storage = ref.watch(secureStorageProvider);

  final client = GrsApiClient(
    baseUrl: baseUrl,
    appVersion: AppEnv.appVersion,
    onTokenRefreshed: (newAccess, newRefresh) async {
      await storage.saveTokens(
        accessToken: newAccess,
        refreshToken: newRefresh,
      );
    },
  );

  // Restore tokens from storage immediately to prevent unauthenticated requests
  storage
      .getAccessToken()
      .then((access) {
        if (access != null && access.isNotEmpty) {
          storage
              .getRefreshToken()
              .then((refresh) {
                client.setTokens(accessToken: access, refreshToken: refresh);
              })
              .catchError((_) {});
        }
      })
      .catchError((_) {});

  return client;
});
