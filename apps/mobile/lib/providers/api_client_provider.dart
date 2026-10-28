import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import '../config/env.dart';

export '../config/env.dart';

final apiBaseUrlProvider = StateProvider<String>((ref) {
  return AppEnv.defaultApiBaseUrl;
});

final apiClientProvider = Provider<GrsApiClient>((ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  return GrsApiClient(baseUrl: baseUrl);
});
