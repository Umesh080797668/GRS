import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/sync/area_download_service.dart';
import 'api_client_provider.dart';
import 'database_provider.dart';

final areaDownloadServiceProvider = Provider<AreaDownloadService?>((ref) {
  final dbAsync = ref.watch(databaseProvider);
  final apiClient = ref.watch(apiClientProvider);

  return dbAsync.when(
    data: (db) => AreaDownloadService(apiClient: apiClient, db: db),
    loading: () => null,
    error: (_, _) => null,
  );
});

final areaDownloadProgressProvider =
    StateNotifierProvider<AreaDownloadNotifier, AreaDownloadProgress>((ref) {
      return AreaDownloadNotifier(ref);
    });

class AreaDownloadNotifier extends StateNotifier<AreaDownloadProgress> {
  final Ref _ref;

  AreaDownloadNotifier(this._ref) : super(const AreaDownloadProgress());

  Future<void> startDownload() async {
    final service = _ref.read(areaDownloadServiceProvider);
    if (service == null) return;

    state = const AreaDownloadProgress(isDownloading: true);

    try {
      await service.downloadArea(
        onProgress: (downloaded, total) {
          state = AreaDownloadProgress(
            downloaded: downloaded,
            total: total,
            isDownloading: true,
          );
        },
      );

      state = AreaDownloadProgress(
        downloaded: state.downloaded,
        total: state.total,
        isDownloading: false,
        isCompleted: true,
      );
    } catch (e) {
      state = AreaDownloadProgress(
        downloaded: state.downloaded,
        total: state.total,
        isDownloading: false,
        error: e.toString(),
      );
    }
  }
}
