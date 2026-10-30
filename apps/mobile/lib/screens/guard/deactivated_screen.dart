import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

/// Deactivated account screen — v2.
///
/// Uses the danger / rejected colour to signal the account state clearly,
/// but stops short of being visually alarming. One clear action: sign out.
class DeactivatedScreen extends ConsumerWidget {
  const DeactivatedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('deactivatedTitle')),
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
                  // Status icon in a tinted container
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: isDark
                          ? GrsColors.syncRejectedBgDark
                          : GrsColors.syncRejectedBg,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const Icon(
                      Icons.block_rounded,
                      size: 44,
                      color: GrsColors.syncRejected,
                    ),
                  ),
                  const SizedBox(height: 28),

                  Text(
                    l10n.get('deactivatedTitle'),
                    style: GrsTypography.headlineLarge(
                      color: ink,
                    ).copyWith(fontSize: 22),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),

                  Text(
                    l10n.get('deactivatedMessage'),
                    style: GrsTypography.bodyLarge(color: secondary),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 40),

                  GrsButton(
                    label: l10n.get('logout'),
                    icon: Icons.logout_rounded,
                    variant: GrsButtonVariant.outline,
                    isFullWidth: true,
                    onPressed: () => ref.read(authProvider.notifier).logout(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
