/// App settings and sync pacing configuration per Build Plan §6.2.
class AppConfigModel {
  final String minSupportedVersion;
  final bool agentCanEditSynced;
  final String consentVersion;
  final String lookupVersion;
  final int syncJitterMaxS;
  final int syncBatchMax;

  const AppConfigModel({
    required this.minSupportedVersion,
    required this.agentCanEditSynced,
    required this.consentVersion,
    required this.lookupVersion,
    required this.syncJitterMaxS,
    required this.syncBatchMax,
  });

  factory AppConfigModel.fromJson(Map<String, dynamic> json) => AppConfigModel(
    minSupportedVersion:
        json['min_supported_version'] as String? ??
        json['minSupportedVersion'] as String? ??
        '1.0.0',
    agentCanEditSynced:
        json['agent_can_edit_synced'] as bool? ??
        json['agentCanEditSynced'] as bool? ??
        false,
    consentVersion:
        json['consent_version'] as String? ??
        json['consentVersion'] as String? ??
        'consent.v0',
    lookupVersion:
        json['lookup_version'] as String? ??
        json['lookupVersion'] as String? ??
        'v1',
    syncJitterMaxS:
        json['sync_jitter_max_s'] as int? ??
        json['syncJitterMaxS'] as int? ??
        30,
    syncBatchMax:
        json['sync_batch_max'] as int? ?? json['syncBatchMax'] as int? ?? 50,
  );

  Map<String, dynamic> toJson() => {
    'min_supported_version': minSupportedVersion,
    'agent_can_edit_synced': agentCanEditSynced,
    'consent_version': consentVersion,
    'lookup_version': lookupVersion,
    'sync_jitter_max_s': syncJitterMaxS,
    'sync_batch_max': syncBatchMax,
  };
}

/// Latest release metadata for Over-The-Air (OTA) APK updates.
class AppReleaseModel {
  final String version;
  final String minSupportedVersion;
  final String apkUrl;
  final String checksum;
  final String? releaseNotes;
  final DateTime? releasedAt;

  const AppReleaseModel({
    required this.version,
    required this.minSupportedVersion,
    required this.apkUrl,
    required this.checksum,
    this.releaseNotes,
    this.releasedAt,
  });

  factory AppReleaseModel.fromJson(Map<String, dynamic> json) =>
      AppReleaseModel(
        version: json['version'] as String? ?? '1.0.0',
        minSupportedVersion:
            json['min_supported_version'] as String? ??
            json['minSupportedVersion'] as String? ??
            '1.0.0',
        apkUrl: json['apk_url'] as String? ?? json['apkUrl'] as String? ?? '',
        checksum: json['checksum'] as String? ?? '',
        releaseNotes:
            json['release_notes'] as String? ?? json['releaseNotes'] as String?,
        releasedAt: json['released_at'] != null
            ? DateTime.tryParse(json['released_at'].toString())
            : (json['releasedAt'] != null
                  ? DateTime.tryParse(json['releasedAt'].toString())
                  : null),
      );

  Map<String, dynamic> toJson() => {
    'version': version,
    'min_supported_version': minSupportedVersion,
    'apk_url': apkUrl,
    'checksum': checksum,
    'release_notes': releaseNotes,
    'released_at': releasedAt?.toIso8601String(),
  };
}
