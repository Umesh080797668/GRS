import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';

/// Persistent offline mode banner — v2.
///
/// Sits at the top of the body, one tone step warmer than the surface.
/// Uses amber semantics (caution, not error) because offline is recoverable.
class GrsOfflineBanner extends StatelessWidget {
  final String message;
  final String? languageCode;

  const GrsOfflineBanner({super.key, required this.message, this.languageCode});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: GrsSpacing.md,
        vertical: GrsSpacing.xs,
      ),
      color: isDark ? GrsColors.syncPendingBgDark : GrsColors.syncPendingBg,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.wifi_off_rounded,
            size: 14,
            color: GrsColors.syncPending,
          ),
          const SizedBox(width: GrsSpacing.xs),
          Flexible(
            child: Text(
              message,
              style: GrsTypography.labelSmall(
                color: GrsColors.syncPending,
                languageCode: languageCode,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
