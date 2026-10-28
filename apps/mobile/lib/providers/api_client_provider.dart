import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';

final apiBaseUrlProvider = StateProvider<String>((ref) {
  // Configurable base URL (default local or staging)
  return const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
});

final apiClientProvider = Provider<GrsApiClient>((ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  return GrsApiClient(baseUrl: baseUrl);
});
