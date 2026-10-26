import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';

/// Banner indicating offline mode per docs/design/DESIGN.md §1.5.
class GrsOfflineBanner extends StatelessWidget {
  final String message;
  final String? languageCode;

  const GrsOfflineBanner({super.key, required this.message, this.languageCode});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: GrsSpacing.md,
        vertical: GrsSpacing.xs,
      ),
      color: GrsColors.syncPendingBg,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.wifi_off_rounded,
            size: 16,
            color: GrsColors.syncPending,
          ),
          const SizedBox(width: GrsSpacing.xs),
          Text(
            message,
            style: GrsTypography.labelSmall(
              color: GrsColors.syncPending,
              languageCode: languageCode,
            ),
          ),
        ],
      ),
    );
  }
}
