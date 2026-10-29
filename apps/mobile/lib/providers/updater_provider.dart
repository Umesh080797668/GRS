import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/app_updater_service.dart';
import 'api_client_provider.dart';

final appUpdaterServiceProvider = Provider<AppUpdaterService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AppUpdaterService(apiClient: apiClient);
});
