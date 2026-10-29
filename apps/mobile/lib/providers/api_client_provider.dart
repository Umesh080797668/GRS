import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import '../config/api_endpoint_resolver.dart';

export '../config/api_endpoint_resolver.dart';
export '../config/env.dart';

final apiBaseUrlProvider = StateProvider<String>((ref) {
  return ApiEndpointResolver.resolveDefault();
});

final apiClientProvider = Provider<GrsApiClient>((ref) {
  final rawUrl = ref.watch(apiBaseUrlProvider);
  final baseUrl = ApiEndpointResolver.sanitize(rawUrl);
  return GrsApiClient(baseUrl: baseUrl);
});
