import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/updater_provider.dart';
import '../../services/app_updater_service.dart';

/// App update check dialog — v2.
class UpdateDialog extends ConsumerStatefulWidget {
  final String currentVersion;
  const UpdateDialog({super.key, required this.currentVersion});

  @override
  ConsumerState<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends ConsumerState<UpdateDialog> {
  bool _isChecking = true;
  bool _isDownloading = false;
  AppReleaseModel? _release;
  bool _isUpdateAvailable = false;
  double _progress = 0.0;
  int _received = 0;
  int _total = 0;
  String? _error;
  File? _downloadedFile;

  @override
  void initState() {
    super.initState();
    _checkUpdate();
  }

  String _formatBytes(int bytes) {
    if (bytes <= 0) return '0 MB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _checkUpdate() async {
    setState(() {
      _isChecking = true;
      _error = null;
    });
    try {
      final updater = ref.read(appUpdaterServiceProvider);
      final release = await updater.fetchLatestRelease();
      final hasUpdate = AppUpdaterService.isUpdateAvailable(
        release.version,
        widget.currentVersion,
      );
      if (mounted) {
        setState(() {
          _isChecking = false;
          _release = release;
          _isUpdateAvailable = hasUpdate;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isChecking = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _startDownload() async {
    if (_release == null) return;
    setState(() {
      _isDownloading = true;
      _error = null;
      _progress = 0.0;
      _received = 0;
      _total = 0;
    });
    try {
      final updater = ref.read(appUpdaterServiceProvider);
      final file = await updater.downloadApk(
        _release!,
        onProgress: (p, r, t) {
          if (mounted) {
            setState(() {
              _progress = p;
              _received = r;
              _total = t;
            });
          }
        },
      );
      if (mounted) {
        setState(() {
          _isDownloading = false;
          _downloadedFile = file;
        });
        await updater.installApk(file);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isDownloading = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Header ────────────────────────────────────────────────────
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isDark
                        ? GrsColors.primaryContainerDark
                        : GrsColors.primaryContainerLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.system_update_rounded,
                    color: primary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.get('checkForUpdates'),
                        style: GrsTypography.titleMedium(color: ink),
                      ),
                      Text(
                        'Current: v${widget.currentVersion}',
                        style: GrsTypography.labelSmall(color: secondary),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(Icons.close_rounded, size: 20, color: secondary),
                ),
              ],
            ),

            const SizedBox(height: 20),

            // ── Body ──────────────────────────────────────────────────────
            if (_isChecking) ...[
              const Center(child: CircularProgressIndicator()),
              const SizedBox(height: 16),
              Text(
                'Checking for updates…',
                style: GrsTypography.bodyMedium(color: secondary),
                textAlign: TextAlign.center,
              ),
            ] else if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark
                      ? GrsColors.syncRejectedBgDark
                      : GrsColors.syncRejectedBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _error!,
                  style: GrsTypography.bodyMedium(
                    color: GrsColors.syncRejected,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              GrsButton(
                label: 'Retry',
                icon: Icons.refresh_rounded,
                variant: GrsButtonVariant.outline,
                isFullWidth: true,
                onPressed: _checkUpdate,
              ),
            ] else if (!_isUpdateAvailable) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: isDark
                      ? GrsColors.syncSyncedBgDark
                      : GrsColors.syncSyncedBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle_rounded,
                      color: GrsColors.syncSynced,
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      "You're on the latest version!",
                      style: GrsTypography.bodyMedium(
                        color: GrsColors.syncSynced,
                      ).copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Update available
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: isDark
                      ? GrsColors.primaryContainerDark
                      : GrsColors.primaryContainerLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.new_releases_rounded, color: primary, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'v${_release!.version} available',
                            style: GrsTypography.titleMedium(
                              color: ink,
                            ).copyWith(fontSize: 14),
                          ),
                          if (_release!.releaseNotes?.isNotEmpty == true)
                            Text(
                              _release!.releaseNotes!,
                              style: GrsTypography.bodyMedium(color: secondary),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (_isDownloading) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: _progress > 0 ? _progress : null,
                    minHeight: 8,
                    backgroundColor: isDark
                        ? GrsColors.surfaceVariantDark
                        : GrsColors.surfaceVariantLight,
                    valueColor: AlwaysStoppedAnimation<Color>(primary),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${(_progress * 100).toStringAsFixed(0)}%',
                      style: GrsTypography.labelMedium(color: ink),
                    ),
                    if (_total > 0)
                      Text(
                        '${_formatBytes(_received)} / ${_formatBytes(_total)}',
                        style: GrsTypography.labelSmall(color: secondary),
                      ),
                  ],
                ),
              ] else if (_downloadedFile != null) ...[
                GrsButton(
                  label: l10n.get('installUpdate'),
                  icon: Icons.install_mobile_rounded,
                  isFullWidth: true,
                  onPressed: () async {
                    try {
                      await ref
                          .read(appUpdaterServiceProvider)
                          .installApk(_downloadedFile!);
                    } catch (e) {
                      setState(() {
                        _error = e.toString().replaceFirst('Exception: ', '');
                      });
                    }
                  },
                ),
              ] else ...[
                GrsButton(
                  label: l10n.get('downloadUpdateButton'),
                  icon: Icons.download_rounded,
                  isFullWidth: true,
                  onPressed: _startDownload,
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
