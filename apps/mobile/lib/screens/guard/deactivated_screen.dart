import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

class DeactivatedScreen extends ConsumerWidget {
  const DeactivatedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = GrsL10n.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('deactivatedTitle')),
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.block_outlined,
                size: 80,
                color: GrsColors.syncRejected,
              ),
              const SizedBox(height: 24),
              Text(
                l10n.get('deactivatedTitle'),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: GrsColors.syncRejected,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.get('deactivatedMessage'),
                style: const TextStyle(
                  fontSize: 16,
                  color: GrsColors.textSecondaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              OutlinedButton(
                onPressed: () => ref.read(authProvider.notifier).logout(),
                child: Text(l10n.get('logout')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
