import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';

/// Sync status values matching Agent Build Plan §5.1.
enum GrsSyncStatus { draft, pending, synced, rejected }

/// Badge widget indicating sync status of records per docs/design/DESIGN.md §3.2.
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
    final (textColor, bgColor, icon) = switch (status) {
      GrsSyncStatus.draft => (
        GrsColors.syncDraft,
        GrsColors.syncDraftBg,
        Icons.edit_note_rounded,
      ),
      GrsSyncStatus.pending => (
        GrsColors.syncPending,
        GrsColors.syncPendingBg,
        Icons.sync_rounded,
      ),
      GrsSyncStatus.synced => (
        GrsColors.syncSynced,
        GrsColors.syncSyncedBg,
        Icons.check_circle_outline_rounded,
      ),
      GrsSyncStatus.rejected => (
        GrsColors.syncRejected,
        GrsColors.syncRejectedBg,
        Icons.error_outline_rounded,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: GrsSpacing.xs,
        vertical: GrsSpacing.xxs,
      ),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: GrsRadii.chip,
        border: Border.all(color: textColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: textColor),
          const SizedBox(width: GrsSpacing.xxs),
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
