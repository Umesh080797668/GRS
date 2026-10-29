import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';
import '../../providers/updater_provider.dart';

class VersionGateScreen extends ConsumerStatefulWidget {
  const VersionGateScreen({super.key});

  @override
  ConsumerState<VersionGateScreen> createState() => _VersionGateScreenState();
}

class _VersionGateScreenState extends ConsumerState<VersionGateScreen> {
  bool _isDownloading = false;
  double _progress = 0.0;
  int _received = 0;
  int _total = 0;
  String? _errorMessage;
  File? _downloadedFile;

  String _formatBytes(int bytes) {
    if (bytes <= 0) return '0 MB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _startUpdate() async {
    setState(() {
      _isDownloading = true;
      _errorMessage = null;
      _progress = 0.0;
      _received = 0;
      _total = 0;
    });

    try {
      final updater = ref.read(appUpdaterServiceProvider);
      final release = await updater.fetchLatestRelease();
      final apkFile = await updater.downloadApk(
        release,
        onProgress: (progress, received, total) {
          if (mounted) {
            setState(() {
              _progress = progress;
              _received = received;
              _total = total;
            });
          }
        },
      );

      if (mounted) {
        setState(() {
          _isDownloading = false;
          _downloadedFile = apkFile;
        });
        await updater.installApk(apkFile);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isDownloading = false;
          _errorMessage = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final authState = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('versionGateTitle')),
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.system_update_alt_rounded,
                size: 80,
                color: GrsColors.primaryLight,
              ),
              const SizedBox(height: 24),
              Text(
                l10n.get('versionGateTitle'),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: GrsColors.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.get('versionGateMessage'),
                style: const TextStyle(
                  fontSize: 16,
                  color: GrsColors.textSecondaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              if (authState.minVersionRequired != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Minimum required version: ${authState.minVersionRequired}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: GrsColors.primaryLight,
                  ),
                ),
              ],
              const SizedBox(height: 32),
              if (_isDownloading) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _progress >= 0 ? _progress : null,
                    minHeight: 10,
                    backgroundColor: GrsColors.surfaceVariantLight,
                    valueColor: const AlwaysStoppedAnimation<Color>(
                      GrsColors.primaryLight,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _progress >= 0
                      ? '${l10n.get('downloadingUpdate')} (${(_progress * 100).toStringAsFixed(0)}%)'
                      : l10n.get('downloadingUpdate'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: GrsColors.textPrimaryLight,
                  ),
                ),
                if (_total > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${_formatBytes(_received)} / ${_formatBytes(_total)}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: GrsColors.textSecondaryLight,
                    ),
                  ),
                ],
              ] else if (_downloadedFile != null) ...[
                GrsButton(
                  text: l10n.get('installUpdate'),
                  icon: Icons.install_mobile_rounded,
                  onPressed: () async {
                    try {
                      await ref
                          .read(appUpdaterServiceProvider)
                          .installApk(_downloadedFile!);
                    } catch (e) {
                      setState(() {
                        _errorMessage = e.toString().replaceFirst(
                          'Exception: ',
                          '',
                        );
                      });
                    }
                  },
                ),
              ] else ...[
                GrsButton(
                  text: l10n.get('downloadUpdateButton'),
                  icon: Icons.download_rounded,
                  onPressed: _startUpdate,
                ),
              ],
              if (_errorMessage != null) ...[
                const SizedBox(height: 16),
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
                          _errorMessage!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: GrsColors.syncRejected,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
