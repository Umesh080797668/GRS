import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/updater_provider.dart';
import '../../services/app_updater_service.dart';

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

    return AlertDialog(
      title: Row(
        children: [
          const Icon(
            Icons.system_update_rounded,
            color: GrsColors.primaryLight,
          ),
          const SizedBox(width: 8),
          Text(l10n.get('checkForUpdates')),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_isChecking) ...[
              const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: CircularProgressIndicator(),
                ),
              ),
              const Center(child: Text('Checking server for updates...')),
            ] else if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: GrsColors.syncRejected.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: GrsColors.syncRejected.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: GrsColors.syncRejected,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: GrsColors.syncRejected,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (!_isUpdateAvailable) ...[
              Row(
                children: [
                  const Icon(
                    Icons.check_circle_rounded,
                    color: GrsColors.syncSynced,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.get('appUpToDate'),
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          'Current version v${widget.currentVersion}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: GrsColors.textSecondaryLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ] else ...[
              // Update available
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: GrsColors.primaryLight.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: GrsColors.primaryLight.withValues(alpha: 0.2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.new_releases_rounded,
                          color: GrsColors.primaryLight,
                          size: 20,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '${l10n.get('updateAvailable')}: v${_release!.version}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                            color: GrsColors.primaryLight,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Installed: v${widget.currentVersion}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GrsColors.textSecondaryLight,
                      ),
                    ),
                    if (_release!.releaseNotes != null &&
                        _release!.releaseNotes!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        _release!.releaseNotes!,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
              if (_isDownloading) ...[
                const SizedBox(height: 16),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _progress >= 0 ? _progress : null,
                    minHeight: 8,
                    backgroundColor: GrsColors.surfaceVariantLight,
                    valueColor: const AlwaysStoppedAnimation<Color>(
                      GrsColors.primaryLight,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _progress >= 0
                          ? '${(_progress * 100).toStringAsFixed(0)}%'
                          : l10n.get('downloadingUpdate'),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (_total > 0)
                      Text(
                        '${_formatBytes(_received)} / ${_formatBytes(_total)}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: GrsColors.textSecondaryLight,
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
      actions: [
        if (_isChecking)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.get('cancel')),
          )
        else if (_error != null) ...[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.get('cancel')),
          ),
          ElevatedButton(onPressed: _checkUpdate, child: const Text('Retry')),
        ] else if (!_isUpdateAvailable)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          )
        else if (_isDownloading)
          const SizedBox.shrink()
        else if (_downloadedFile != null) ...[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.get('cancel')),
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.install_mobile_rounded, size: 18),
            label: Text(l10n.get('installUpdate')),
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
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.get('cancel')),
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.download_rounded, size: 18),
            label: Text(l10n.get('installUpdate')),
            onPressed: _startDownload,
          ),
        ],
      ],
    );
  }
}
