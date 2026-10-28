import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

class VersionGateScreen extends ConsumerWidget {
  const VersionGateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              GrsButton(
                text: l10n.get('downloadUpdateButton'),
                icon: Icons.download_rounded,
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Opening APK download page...'),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
