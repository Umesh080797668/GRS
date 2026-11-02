/// App settings and sync pacing configuration per Build Plan §6.2.
class AppConfigModel {
  final String minSupportedVersion;
  final bool agentCanEditSynced;
  final String consentVersion;
  final String lookupVersion;
  final int syncJitterMaxS;
  final int syncBatchMax;
  final List<String> webEntryRoles;

  const AppConfigModel({
    required this.minSupportedVersion,
    required this.agentCanEditSynced,
    required this.consentVersion,
    required this.lookupVersion,
    required this.syncJitterMaxS,
    required this.syncBatchMax,
    this.webEntryRoles = const ['admin', 'cg', 'dc', 'sda', 'cdc_secretary'],
  });

  factory AppConfigModel.fromJson(Map<String, dynamic> json) {
    List<String> parseRoles() {
      if (json['web_entry_roles'] is List) {
        return (json['web_entry_roles'] as List)
            .map((e) => e.toString())
            .toList();
      }
      if (json['webEntryRoles'] is List) {
        return (json['webEntryRoles'] as List)
            .map((e) => e.toString())
            .toList();
      }
      final features = json['features'];
      if (features is Map<String, dynamic> &&
          features['web_entry_roles'] is List) {
        return (features['web_entry_roles'] as List)
            .map((e) => e.toString())
            .toList();
      }
      // Decision C19: Level 00 (super_admin) is off by default
      return const ['admin', 'cg', 'dc', 'sda', 'cdc_secretary'];
    }

    return AppConfigModel(
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
      webEntryRoles: parseRoles(),
    );
  }

  Map<String, dynamic> toJson() => {
    'min_supported_version': minSupportedVersion,
    'agent_can_edit_synced': agentCanEditSynced,
    'consent_version': consentVersion,
    'lookup_version': lookupVersion,
    'sync_jitter_max_s': syncJitterMaxS,
    'sync_batch_max': syncBatchMax,
    'web_entry_roles': webEntryRoles,
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
  final bool? isUpdateAvailable;
  final bool? isLatest;
  final String? message;

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
    this.isUpdateAvailable,
    this.isLatest,
    this.message,
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
    isUpdateAvailable:
        json['is_update_available'] as bool? ??
        json['isUpdateAvailable'] as bool?,
    isLatest: json['is_latest'] as bool? ?? json['isLatest'] as bool?,
    message: json['message'] as String?,
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
    'is_update_available': isUpdateAvailable,
    'is_latest': isLatest,
    'message': message,
  };
}
