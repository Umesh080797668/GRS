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

/// Latest release metadata for Over-The-Air (OTA) APK updates matching release manifest.
class AppReleaseModel {
  final String version;
  final int? buildNumber;
  final String minSupportedVersion;
  final String apkUrl;
  final String checksum;
  final int? fileSize;
  final String? releaseNotes;
  final DateTime? releasedAt;
  final bool mandatory;

  const AppReleaseModel({
    required this.version,
    this.buildNumber,
    required this.minSupportedVersion,
    required this.apkUrl,
    required this.checksum,
    this.fileSize,
    this.releaseNotes,
    this.releasedAt,
    this.mandatory = false,
  });

  String get sha256 => checksum;

  factory AppReleaseModel.fromJson(
    Map<String, dynamic> json,
  ) => AppReleaseModel(
    version: json['version'] as String? ?? '1.0.0',
    buildNumber: json['build_number'] as int? ?? json['buildNumber'] as int?,
    minSupportedVersion:
        json['min_supported_version'] as String? ??
        json['minSupportedVersion'] as String? ??
        '1.0.0',
    apkUrl: json['apk_url'] as String? ?? json['apkUrl'] as String? ?? '',
    checksum: json['sha256'] as String? ?? json['checksum'] as String? ?? '',
    fileSize: json['file_size'] as int? ?? json['fileSize'] as int?,
    releaseNotes:
        json['release_notes'] as String? ?? json['releaseNotes'] as String?,
    releasedAt: json['released_at'] != null
        ? DateTime.tryParse(json['released_at'].toString())
        : (json['releasedAt'] != null
              ? DateTime.tryParse(json['releasedAt'].toString())
              : null),
    mandatory: json['mandatory'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'version': version,
    'build_number': buildNumber,
    'min_supported_version': minSupportedVersion,
    'apk_url': apkUrl,
    'sha256': checksum,
    'checksum': checksum,
    'file_size': fileSize,
    'release_notes': releaseNotes,
    'released_at': releasedAt?.toIso8601String(),
    'mandatory': mandatory,
  };
}
