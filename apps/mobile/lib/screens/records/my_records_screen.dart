import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';
import '../../providers/sync_provider.dart';

class MyRecordsScreen extends ConsumerStatefulWidget {
  const MyRecordsScreen({super.key});

  @override
  ConsumerState<MyRecordsScreen> createState() => _MyRecordsScreenState();
}

class _MyRecordsScreenState extends ConsumerState<MyRecordsScreen> {
  String _selectedFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final dbAsync = ref.watch(databaseProvider);
    final revision = ref.watch(recordsRevisionProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return Scaffold(
      appBar: AppBar(title: GrsRiseIn(child: Text(l10n.get('myRecords')))),
      body: dbAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (db) {
          SyncStatus? filterStatus;
          if (_selectedFilter != 'all') {
            filterStatus = SyncStatusX.fromString(_selectedFilter);
          }

          return FutureBuilder<List<Map<String, dynamic>>>(
            key: ValueKey('records_${_selectedFilter}_$revision'),
            future: db.getAllClients(status: filterStatus),
            builder: (context, snapshot) {
              final records = snapshot.data ?? [];

              return Column(
                children: [
                  // ── Filter chips ─────────────────────────────────────────
                  GrsFadeIn(
                    child: Container(
                      color: isDark
                          ? GrsColors.surfaceDark
                          : GrsColors.surfaceLight,
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                        child: Row(
                          children: [
                            _FilterChip(
                              filterId: 'all',
                              label: l10n.get('all'),
                              selected: _selectedFilter == 'all',
                              onTap: () =>
                                  setState(() => _selectedFilter = 'all'),
                              isDark: isDark,
                            ),
                            const SizedBox(width: 8),
                            _FilterChip(
                              filterId: 'draft',
                              label: l10n.get('statusDraft'),
                              selected: _selectedFilter == 'draft',
                              onTap: () =>
                                  setState(() => _selectedFilter = 'draft'),
                              isDark: isDark,
                            ),
                            const SizedBox(width: 8),
                            _FilterChip(
                              filterId: 'pending',
                              label: l10n.get('statusPending'),
                              selected: _selectedFilter == 'pending',
                              onTap: () =>
                                  setState(() => _selectedFilter = 'pending'),
                              isDark: isDark,
                            ),
                            const SizedBox(width: 8),
                            _FilterChip(
                              filterId: 'synced',
                              label: l10n.get('statusSynced'),
                              selected: _selectedFilter == 'synced',
                              onTap: () =>
                                  setState(() => _selectedFilter = 'synced'),
                              isDark: isDark,
                            ),
                            const SizedBox(width: 8),
                            _FilterChip(
                              filterId: 'rejected',
                              label: l10n.get('statusRejected'),
                              selected: _selectedFilter == 'rejected',
                              onTap: () =>
                                  setState(() => _selectedFilter = 'rejected'),
                              isDark: isDark,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  Divider(
                    height: 1,
                    color: isDark
                        ? GrsColors.outlineDark
                        : GrsColors.outlineLight,
                  ),

                  // ── Records list ─────────────────────────────────────────
                  Expanded(
                    child: records.isEmpty
                        ? GrsFadeIn(
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.all(40),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.assignment_turned_in_outlined,
                                      size: 64,
                                      color: isDark
                                          ? GrsColors.textTertiaryDark
                                          : GrsColors.textTertiaryLight,
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      'No records for "$_selectedFilter"',
                                      style: GrsTypography.bodyMedium(
                                        color: secondary,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: records.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final r = records[index];
                              final id = r['id'] as String;
                              final houseId = r['household_id'] as String;
                              final name = r['name'] as String;
                              final age = r['age'] as int;
                              final gender = r['gender'] as String;
                              final status = r['sync_status'] as String;
                              final lastError = r['last_error_code'] as String?;
                              final isFemale = gender == 'F';

                              final avatarBg = isFemale
                                  ? (isDark
                                        ? const Color(0xFF2D1B45)
                                        : const Color(0xFFF3E8FF))
                                  : (isDark
                                        ? GrsColors.primaryContainerDark
                                        : GrsColors.primaryContainerLight);
                              final avatarInk = isFemale
                                  ? const Color(0xFF9333EA)
                                  : (isDark
                                        ? GrsColors.primaryDark
                                        : GrsColors.primaryLight);

                              return GrsFadeSlideItem(
                                index: index < 12 ? index : 0,
                                child: GrsCard(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 12,
                                  ),
                                  onTap: () async {
                                    if (status == 'rejected') {
                                      _showRejectedDialog(
                                        context,
                                        id,
                                        houseId,
                                        lastError,
                                      );
                                    } else {
                                      await context.push(
                                        '/houses/$houseId/client/$id',
                                      );
                                      ref
                                          .read(
                                            recordsRevisionProvider.notifier,
                                          )
                                          .increment();
                                    }
                                  },
                                  child: Row(
                                    children: [
                                      // Avatar
                                      Container(
                                        width: 44,
                                        height: 44,
                                        decoration: BoxDecoration(
                                          color: avatarBg,
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                        ),
                                        alignment: Alignment.center,
                                        child: Text(
                                          isFemale ? '♀' : '♂',
                                          style: TextStyle(
                                            fontSize: 20,
                                            color: avatarInk,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 14),

                                      // Info
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              name,
                                              style: GrsTypography.titleMedium(
                                                color: ink,
                                              ).copyWith(fontSize: 15),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              'Age $age · ${isFemale ? 'Female' : 'Male'}',
                                              style: GrsTypography.bodyMedium(
                                                color: secondary,
                                              ),
                                            ),
                                            if (status == 'rejected' &&
                                                lastError != null) ...[
                                              const SizedBox(height: 2),
                                              Text(
                                                'Reason: $lastError',
                                                style: GrsTypography.labelSmall(
                                                  color: GrsColors.syncRejected,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 10),

                                      // Badge
                                      _buildBadge(status, l10n),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  void _showRejectedDialog(
    BuildContext context,
    String clientId,
    String houseId,
    String? reason,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.error_rounded, color: GrsColors.syncRejected, size: 20),
            SizedBox(width: 8),
            Text('Record Rejected'),
          ],
        ),
        content: Text(
          'Server rejection reason:\n\n${reason ?? "Validation failed"}\n\nFix the errors and resubmit.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await context.push('/houses/$houseId/client/$clientId');
              ref.read(recordsRevisionProvider.notifier).increment();
            },
            child: const Text('Fix & Resubmit'),
          ),
        ],
      ),
    );
  }

  Widget _buildBadge(String status, GrsL10n l10n) {
    return switch (status) {
      'synced' => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.check_circle_outline_rounded,
            size: 16,
            color: GrsColors.syncSynced,
          ),
          const SizedBox(width: 4),
          GrsSyncBadge(
            status: GrsSyncStatus.synced,
            label: l10n.get('statusSynced'),
          ),
        ],
      ),
      'pending' => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.edit_outlined,
            size: 16,
            color: GrsColors.syncPending,
          ),
          const SizedBox(width: 4),
          GrsSyncBadge(
            status: GrsSyncStatus.pending,
            label: l10n.get('statusPending'),
          ),
        ],
      ),
      'rejected' => GrsSyncBadge(
        status: GrsSyncStatus.rejected,
        label: l10n.get('statusRejected'),
      ),
      _ => GrsSyncBadge(
        status: GrsSyncStatus.draft,
        label: l10n.get('statusDraft'),
      ),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.filterId,
    required this.label,
    required this.selected,
    required this.onTap,
    required this.isDark,
  });
  final String filterId;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}
