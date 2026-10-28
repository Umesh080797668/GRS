import 'household.dart';

/// Sync domain models per DD-Campaign_Agent_Build_Plan.md §6.2 and §8.3.
enum SyncStatus { draft, pending, synced, failed, rejected }

extension SyncStatusX on SyncStatus {
  String get name => toString().split('.').last;

  static SyncStatus fromString(String value) {
    switch (value.toLowerCase()) {
      case 'draft':
        return SyncStatus.draft;
      case 'pending':
        return SyncStatus.pending;
      case 'synced':
        return SyncStatus.synced;
      case 'failed':
        return SyncStatus.failed;
      case 'rejected':
        return SyncStatus.rejected;
      default:
        return SyncStatus.draft;
    }
  }
}

class SyncRecordPayload {
  final String type; // e.g. "client"
  final String id;
  final int baseVersion;
  final DateTime clientUpdatedAt;
  final Map<String, dynamic> data;

  const SyncRecordPayload({
    this.type = 'client',
    required this.id,
    required this.baseVersion,
    required this.clientUpdatedAt,
    required this.data,
  });

  Map<String, dynamic> toJson() => {
    'type': type,
    'id': id,
    'base_version': baseVersion,
    'client_updated_at': clientUpdatedAt.toUtc().toIso8601String(),
    'data': data,
  };

  factory SyncRecordPayload.fromJson(Map<String, dynamic> json) =>
      SyncRecordPayload(
        type: json['type'] as String? ?? 'client',
        id: json['id'] as String,
        baseVersion:
            json['base_version'] as int? ?? json['baseVersion'] as int? ?? 0,
        clientUpdatedAt: DateTime.parse(
          json['client_updated_at'] as String? ??
              json['clientUpdatedAt'] as String,
        ),
        data: json['data'] as Map<String, dynamic>,
      );
}

class SyncPushRequest {
  final String deviceId;
  final String appVersion;
  final int schemaVersion;
  final List<SyncRecordPayload> records;

  const SyncPushRequest({
    required this.deviceId,
    required this.appVersion,
    this.schemaVersion = 1,
    required this.records,
  });

  Map<String, dynamic> toJson() => {
    'device_id': deviceId,
    'app_version': appVersion,
    'schema_version': schemaVersion,
    'records': records.map((r) => r.toJson()).toList(),
  };

  factory SyncPushRequest.fromJson(
    Map<String, dynamic> json,
  ) => SyncPushRequest(
    deviceId: json['device_id'] as String? ?? json['deviceId'] as String? ?? '',
    appVersion:
        json['app_version'] as String? ??
        json['appVersion'] as String? ??
        '1.0.0',
    schemaVersion:
        json['schema_version'] as int? ?? json['schemaVersion'] as int? ?? 1,
    records: (json['records'] as List<dynamic>)
        .map((r) => SyncRecordPayload.fromJson(r as Map<String, dynamic>))
        .toList(),
  );
}

class SyncRecordResult {
  final String id;
  final String status; // 'ok' | 'stale' | 'rejected' | 'forbidden' | 'locked'
  final int? serverVersion;
  final String? code;

  const SyncRecordResult({
    required this.id,
    required this.status,
    this.serverVersion,
    this.code,
  });

  bool get isOk => status == 'ok';
  bool get isRejected => status == 'rejected';
  bool get isLocked => status == 'locked';
  bool get isForbidden => status == 'forbidden';

  factory SyncRecordResult.fromJson(Map<String, dynamic> json) =>
      SyncRecordResult(
        id: json['id'] as String,
        status: json['status'] as String,
        serverVersion:
            json['server_version'] as int? ?? json['serverVersion'] as int?,
        code: json['code'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'status': status,
    'server_version': serverVersion,
    'code': code,
  };
}

class SyncPushResponse {
  final List<SyncRecordResult> results;

  const SyncPushResponse({required this.results});

  factory SyncPushResponse.fromJson(Map<String, dynamic> json) {
    final list = json['results'] as List<dynamic>? ?? [];
    return SyncPushResponse(
      results: list
          .map((r) => SyncRecordResult.fromJson(r as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'results': results.map((r) => r.toJson()).toList(),
  };
}

/// Area data payload returned by GET /sync/area
class AreaDownloadResponse {
  final List<Household> items;
  final String? nextCursor;
  final bool hasMore;
  final int total;
  final Map<String, dynamic>? lookups;

  const AreaDownloadResponse({
    required this.items,
    this.nextCursor,
    required this.hasMore,
    required this.total,
    this.lookups,
  });

  factory AreaDownloadResponse.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return AreaDownloadResponse(
      items: rawItems
          .map((i) => Household.fromJson(i as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
      hasMore: json['hasMore'] as bool? ?? false,
      total: json['total'] as int? ?? rawItems.length,
      lookups: json['lookups'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
    'items': items.map((h) => h.toJson()).toList(),
    'nextCursor': nextCursor,
    'hasMore': hasMore,
    'total': total,
    'lookups': lookups,
  };
}
