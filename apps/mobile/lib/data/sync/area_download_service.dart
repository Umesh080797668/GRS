import 'dart:async';
import 'dart:convert';
import 'package:grs_core/grs_core.dart';
import '../local/database.dart';

class AreaDownloadProgress {
  final int downloaded;
  final int total;
  final bool isDownloading;
  final bool isCompleted;
  final String? error;

  const AreaDownloadProgress({
    this.downloaded = 0,
    this.total = 0,
    this.isDownloading = false,
    this.isCompleted = false,
    this.error,
  });

  double get progressRatio =>
      total > 0 ? (downloaded / total).clamp(0.0, 1.0) : 0.0;
  int get percent => (progressRatio * 100).toInt();
}

class AreaDownloadService {
  final GrsApiClient _apiClient;
  final AppDatabase _db;

  AreaDownloadService({
    required GrsApiClient apiClient,
    required AppDatabase db,
  }) : _apiClient = apiClient,
       _db = db;

  /// Downloads area data in pages (≤500 rows/page) and saves to local SQLite database.
  /// Supports resuming from the last successfully saved cursor (M2.7).
  Future<void> downloadArea({
    void Function(int downloaded, int total)? onProgress,
  }) async {
    // 1. Check for resumable cursor
    String? cursor = await _db.getMeta('area_sync_cursor');
    if (cursor != null && cursor.isEmpty) {
      cursor = null;
    }

    int downloadedCount = 0;
    final downloadedIds = <String>{};

    if (cursor != null) {
      downloadedCount =
          int.tryParse(await _db.getMeta('area_sync_count') ?? '0') ?? 0;
      final savedIdsJson = await _db.getMeta('area_sync_seen_ids');
      if (savedIdsJson != null && savedIdsJson.isNotEmpty) {
        try {
          downloadedIds.addAll(
            (jsonDecode(savedIdsJson) as List).cast<String>(),
          );
        } catch (_) {}
      }
    } else {
      await _db.setMeta('area_sync_count', '0');
      await _db.setMeta('area_sync_seen_ids', '');
    }

    bool hasMore = true;

    while (hasMore) {
      final page = await _apiClient.downloadArea(cursor: cursor, limit: 500);

      if (page.items.isNotEmpty) {
        for (final h in page.items) {
          downloadedIds.add(h.id);
          await _db.upsertHousehold(h);
        }
        downloadedCount += page.items.length;
      }

      // Save lookups if present in page
      if (page.lookups != null && page.lookups!.isNotEmpty) {
        final lookupList = <LookupValueModel>[];
        page.lookups!.forEach((category, items) {
          if (items is List) {
            for (final item in items) {
              if (item is Map<String, dynamic>) {
                lookupList.add(LookupValueModel.fromJson(item));
              }
            }
          }
        });
        if (lookupList.isNotEmpty) {
          await _db.upsertLookups(lookupList);
        }
      }

      cursor = page.nextCursor;
      hasMore = page.hasMore && cursor != null;

      if (hasMore) {
        // Save resumable checkpoint
        await _db.setMeta('area_sync_cursor', cursor);
        await _db.setMeta('area_sync_count', downloadedCount.toString());
        await _db.setMeta(
          'area_sync_seen_ids',
          jsonEncode(downloadedIds.toList()),
        );
      } else {
        // Prune houses deleted or reassigned on the server
        if (downloadedIds.isNotEmpty) {
          await _db.removeHouseholdsNotIn(downloadedIds);
        }
        // Download complete: clear cursor, reset count, and record completion timestamp
        await _db.setMeta('area_sync_cursor', '');
        await _db.setMeta('area_sync_count', '0');
        await _db.setMeta('area_sync_seen_ids', '');
        await _db.setMeta(
          'area_sync_completed_at',
          DateTime.now().toUtc().toIso8601String(),
        );
      }

      onProgress?.call(downloadedCount, page.total);
    }
  }
}
