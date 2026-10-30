import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';
import '../tokens/motions.dart';

/// Sync status values.
enum GrsSyncStatus { draft, pending, synced, rejected }

/// Status badge — v2.
///
/// Compact pill showing sync/completion state with icon + label.
/// Animates the background colour change via [AnimatedContainer].
class GrsSyncBadge extends StatelessWidget {
  final GrsSyncStatus status;
  final String label;
  final String? languageCode;

  const GrsSyncBadge({
    super.key,
    required this.status,
    required this.label,
    this.languageCode,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final (textColor, bgColor, icon) = switch (status) {
      GrsSyncStatus.draft => (
        GrsColors.syncDraft,
        isDark ? GrsColors.syncDraftBgDark : GrsColors.syncDraftBg,
        Icons.edit_note_rounded,
      ),
      GrsSyncStatus.pending => (
        GrsColors.syncPending,
        isDark ? GrsColors.syncPendingBgDark : GrsColors.syncPendingBg,
        Icons.schedule_rounded,
      ),
      GrsSyncStatus.synced => (
        GrsColors.syncSynced,
        isDark ? GrsColors.syncSyncedBgDark : GrsColors.syncSyncedBg,
        Icons.check_circle_rounded,
      ),
      GrsSyncStatus.rejected => (
        GrsColors.syncRejected,
        isDark ? GrsColors.syncRejectedBgDark : GrsColors.syncRejectedBg,
        Icons.error_rounded,
      ),
    };

    return AnimatedContainer(
      duration: GrsMotion.durationMedium,
      curve: GrsMotion.curveEnter,
      padding: const EdgeInsets.symmetric(
        horizontal: GrsSpacing.xs,
        vertical: GrsSpacing.xxs + 2,
      ),
      decoration: BoxDecoration(color: bgColor, borderRadius: GrsRadii.chip),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: textColor),
          const SizedBox(width: 4),
          Text(
            label,
            style: GrsTypography.labelSmall(
              color: textColor,
              languageCode: languageCode,
            ),
          ),
        ],
      ),
    );
  }
}
