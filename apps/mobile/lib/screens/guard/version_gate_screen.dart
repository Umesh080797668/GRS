import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';
import '../../providers/updater_provider.dart';

/// Version gate screen — v2.
///
/// Shown when the running build is below the server's minimum required version.
/// The user MUST update before they can use the app.
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('versionGateTitle')),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: GrsFadeIn(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Icon
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: isDark
                          ? GrsColors.primaryContainerDark
                          : GrsColors.primaryContainerLight,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Icon(
                      Icons.system_update_alt_rounded,
                      size: 44,
                      color: primary,
                    ),
                  ),
                  const SizedBox(height: 28),

                  Text(
                    l10n.get('versionGateTitle'),
                    style: GrsTypography.headlineLarge(
                      color: ink,
                    ).copyWith(fontSize: 22),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),

                  Text(
                    l10n.get('versionGateMessage'),
                    style: GrsTypography.bodyLarge(color: secondary),
                    textAlign: TextAlign.center,
                  ),

                  if (authState.minVersionRequired != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? GrsColors.primaryContainerDark
                            : GrsColors.primaryContainerLight,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Required: v${authState.minVersionRequired}',
                        style: GrsTypography.labelMedium(
                          color: primary,
                        ).copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],

                  const SizedBox(height: 40),

                  // ── Download / install state ─────────────────────────────
                  if (_isDownloading) ...[
                    // Progress bar
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: _progress > 0 ? _progress : null,
                        minHeight: 8,
                        backgroundColor: isDark
                            ? GrsColors.surfaceVariantDark
                            : GrsColors.surfaceVariantLight,
                        valueColor: AlwaysStoppedAnimation<Color>(primary),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _progress > 0
                          ? '${l10n.get('downloadingUpdate')} · ${(_progress * 100).toStringAsFixed(0)}%'
                          : l10n.get('downloadingUpdate'),
                      style: GrsTypography.labelMedium(color: ink),
                    ),
                    if (_total > 0) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${_formatBytes(_received)} / ${_formatBytes(_total)}',
                        style: GrsTypography.labelSmall(color: secondary),
                      ),
                    ],
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
                      label: l10n.get('downloadUpdateButton'),
                      icon: Icons.download_rounded,
                      isFullWidth: true,
                      onPressed: _startUpdate,
                    ),
                  ],

                  // ── Error ─────────────────────────────────────────────────
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark
                            ? GrsColors.syncRejectedBgDark
                            : GrsColors.syncRejectedBg,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_rounded,
                            color: GrsColors.syncRejected,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: GrsTypography.bodyMedium(
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
        ),
      ),
    );
  }
}
