import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/area_download_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';
import '../../providers/duplicates_provider.dart';
import '../../providers/sync_provider.dart';
import '../../providers/theme_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with TickerProviderStateMixin {
  final _searchController = TextEditingController();
  String _selectedFilter = 'all';

  late final AnimationController _syncCtrl;
  late final AnimationController _heroPulseCtrl;
  late final Animation<double> _heroPulse;

  @override
  void initState() {
    super.initState();

    _syncCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );

    // Subtle pulse on the status dot in the hero panel.
    _heroPulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains(
      'Test',
    );
    if (!isTest) {
      _heroPulseCtrl.repeat(reverse: true);
    }

    _heroPulse = Tween<double>(
      begin: 0.5,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _heroPulseCtrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _searchController.dispose();
    _syncCtrl.dispose();
    _heroPulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _downloadArea() async {
    final l10n = GrsL10n.of(context);
    await ref.read(areaDownloadProgressProvider.notifier).startDownload();
    if (!mounted) return;
    final state = ref.read(areaDownloadProgressProvider);
    if (state.error != null) {
      final msg =
          (state.error == 'downloadFailed' ||
              state.error!.startsWith('errors.'))
          ? l10n.get(state.error!)
          : state.error!;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              msg.isNotEmpty
                  ? msg
                  : 'Failed to download area data. Check network.',
            ),
            backgroundColor: GrsColors.syncRejected,
          ),
        );
      }
    } else if (state.isCompleted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.get('areaDataLoadedSuccess'))),
        );
        setState(() {});
      }
    }
  }

  Future<void> _startAssessmentFlow() async {
    final l10n = GrsL10n.of(context);
    final db = await ref.read(databaseProvider.future);
    final authState = ref.read(authProvider);
    final houses = await db.getHouseholds(gnId: authState.profile?.gnId);

    if (!mounted) return;

    if (houses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.get('noHousesFound').isNotEmpty
                ? l10n.get('noHousesFound')
                : 'No households found. Please download area data first.',
          ),
          backgroundColor: GrsColors.syncPending,
        ),
      );
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.9,
          expand: false,
          builder: (sheetCtx, scrollCtrl) {
            return Column(
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Text(
                    l10n.get('chooseHouses'),
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: isDark
                          ? GrsColors.textPrimaryDark
                          : GrsColors.textPrimaryLight,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    controller: scrollCtrl,
                    itemCount: houses.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (itemCtx, i) {
                      final h = houses[i];
                      final id = h['id'] as String;
                      final houseNo = h['house_no'] as String;
                      final leader = h['house_leader_name'] as String;
                      final serialNo = h['serial_no'] as int;

                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isDark
                              ? GrsColors.primaryContainerDark
                              : GrsColors.primaryContainerLight,
                          child: Text(
                            '$serialNo',
                            style: TextStyle(
                              color: isDark
                                  ? GrsColors.primaryDark
                                  : GrsColors.primaryLight,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Text('${l10n.get('houseNumber')}: $houseNo'),
                        subtitle: Text(leader),
                        trailing: const Icon(
                          Icons.arrow_forward_ios_rounded,
                          size: 16,
                        ),
                        onTap: () async {
                          Navigator.of(ctx).pop();
                          await context.push('/houses/$id/consent');
                          ref
                              .read(recordsRevisionProvider.notifier)
                              .increment();
                        },
                      );
                    },
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _triggerSync() async {
    final ok = await ref.read(syncProvider.notifier).sync();
    await ref.read(syncProvider.notifier).pullChanges();
    if (!mounted) return;
    final syncState = ref.read(syncProvider);
    final msg =
        syncState.lastMessage ?? (ok ? 'Sync completed' : 'Sync paused');
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final dbAsync = ref.watch(databaseProvider);
    final downloadProgress = ref.watch(areaDownloadProgressProvider);
    final isOnline = ref.watch(connectivityProvider);
    final revision = ref.watch(recordsRevisionProvider);
    final pendingCount = ref.watch(pendingCountProvider).value ?? 0;
    final authState = ref.watch(authProvider);

    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final heroBg = isDark ? GrsColors.heroBannerBgDark : GrsColors.heroBannerBg;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: GrsRiseIn(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.get('appTitle'),
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                  color: ink,
                ),
              ),
            ],
          ),
        ),
        actions: [
          // Quick theme toggle
          GrsBounceTouch(
            onTap: () {
              ref
                  .read(themeModeProvider.notifier)
                  .toggleTheme(isCurrentlyDark: isDark);
            },
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Icon(
                isDark ? Icons.light_mode_rounded : Icons.dark_mode_outlined,
                color: secondary,
                size: 22,
              ),
            ),
          ),
          GrsBounceTouch(
            onTap: _triggerSync,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Badge(
                isLabelVisible: pendingCount > 0,
                label: Text(
                  '$pendingCount',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                backgroundColor: const Color(0xFFF59E0B),
                child: RotationTransition(
                  turns: _syncCtrl,
                  child: Icon(
                    Icons.sync_rounded,
                    color: secondary.withValues(alpha: 0.4),
                    size: 22,
                  ),
                ),
              ),
            ),
          ),
          GrsBounceTouch(
            onTap: () => context.push('/settings'),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Icon(Icons.settings_outlined, color: secondary, size: 22),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // ── Hero Status Panel ──────────────────────────────────────────────
          GrsRiseIn(
            riseY: GrsMotion.heroRise,
            child: _HeroPanel(
              l10n: l10n,
              heroBg: heroBg,
              heroPulse: _heroPulse,
              isOnline: isOnline,
              pendingCount: pendingCount,
              onStartAssessment: _startAssessmentFlow,
            ),
          ),

          // ── Expired Session Notice Banner (Blueprint §7.6) ──────────────────
          if (authState.isSessionExpiredOffline) ...[
            GrsFadeIn(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF451A03)
                        : const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isDark
                          ? const Color(0xFF92400E)
                          : const Color(0xFFFCD34D),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.warning_amber_rounded,
                        size: 20,
                        color: isDark
                            ? const Color(0xFFFCD34D)
                            : const Color(0xFFB45309),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.get('offlineSessionExpiredTitle'),
                              style: GrsTypography.labelMedium(
                                color: isDark
                                    ? const Color(0xFFFCD34D)
                                    : const Color(0xFF92400E),
                              ).copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              l10n.get('offlineSessionExpiredNotice'),
                              style: GrsTypography.labelSmall(
                                color: isDark
                                    ? const Color(0xFFFDE68A)
                                    : const Color(0xFF78350F),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ] else if (!isOnline) ...[
            GrsFadeIn(
              child: const Padding(
                padding: EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: ClipRRect(
                  borderRadius: BorderRadius.all(Radius.circular(10)),
                  child: GrsOfflineBanner(
                    message:
                        'Offline Mode • Records saved locally and will sync when back online.',
                  ),
                ),
              ),
            ),
          ],

          // ── Level 4 Management Hub (CDC Secretary) ────────────────────────
          if (authState.profile?.role == 'cdc_secretary') ...[
            GrsFadeIn(
              delay: const Duration(milliseconds: 140),
              child: _Level4Hub(isDark: isDark),
            ),
          ],

          // ── Search + Filters ───────────────────────────────────────────────
          GrsFadeIn(
            delay: const Duration(milliseconds: 180),
            child: _SearchFilterRow(
              controller: _searchController,
              selectedFilter: _selectedFilter,
              onFilterChange: (f) => setState(() => _selectedFilter = f),
              onSearchChange: () => setState(() {}),
              l10n: l10n,
              isDark: isDark,
            ),
          ),

          // ── Households List ────────────────────────────────────────────────
          Expanded(
            child: dbAsync.when(
              loading: () => _buildLoadingSkeletons(isDark),
              error: (err, _) => Center(child: Text('Database error: $err')),
              data: (db) {
                return FutureBuilder<List<Map<String, dynamic>>>(
                  key: ValueKey(
                    'households_${_selectedFilter}_${_searchController.text}_${authState.profile?.gnId}_$revision',
                  ),
                  future: db.getHouseholds(
                    search: _searchController.text.trim().isEmpty
                        ? null
                        : _searchController.text.trim(),
                    statusFilter: _selectedFilter == 'all'
                        ? null
                        : _selectedFilter,
                    gnId: authState.profile?.gnId,
                  ),
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) {
                      return _buildLoadingSkeletons(isDark);
                    }
                    final households = snapshot.data!;

                    if (households.isEmpty) {
                      return _EmptyState(
                        downloadProgress: downloadProgress,
                        onDownload: _downloadArea,
                        l10n: l10n,
                        isDark: isDark,
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: () async {
                        ref.read(recordsRevisionProvider.notifier).increment();
                      },
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        itemCount: households.length,
                        itemBuilder: (context, index) {
                          final h = households[index];
                          final houseId = h['id'] as String;
                          final houseNo = h['house_no'] as String;
                          final serialNo = h['serial_no'] as int;
                          final leader = h['house_leader_name'] as String;
                          final status =
                              h['status'] as String? ?? 'not_started';

                          return GrsFadeSlideItem(
                            index: index < 12 ? index : 0,
                            offsetY: GrsMotion.listRise,
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _HouseCard(
                                houseId: houseId,
                                houseNo: houseNo,
                                serialNo: serialNo,
                                leader: leader,
                                status: status,
                                l10n: l10n,
                                isDark: isDark,
                                onRefresh: () {
                                  ref
                                      .read(recordsRevisionProvider.notifier)
                                      .increment();
                                },
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Hero Panel
// ────────────────────────────────────────────────────────────────────────────

class _HeroPanel extends StatelessWidget {
  const _HeroPanel({
    required this.l10n,
    required this.heroBg,
    required this.heroPulse,
    required this.isOnline,
    required this.pendingCount,
    required this.onStartAssessment,
  });

  final GrsL10n l10n;
  final Color heroBg;
  final Animation<double> heroPulse;
  final bool isOnline;
  final int pendingCount;
  final VoidCallback onStartAssessment;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      decoration: BoxDecoration(
        color: heroBg,
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  l10n.get('fieldWorkStatus'),
                  style: GrsTypography.labelSmall(
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              // Connection status badge
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (pendingCount > 0) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.20),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.cloud_upload_outlined,
                            size: 11,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '$pendingCount ${l10n.get('statusPending')}',
                            style: GrsTypography.labelSmall(color: Colors.white)
                                .copyWith(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 11,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  FadeTransition(
                    opacity: heroPulse,
                    child: Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: isOnline
                            ? GrsColors.syncSynced
                            : const Color(0xFFF59E0B),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (!isOnline) ...[
                    const Icon(
                      Icons.airplanemode_active_rounded,
                      size: 11,
                      color: Colors.white70,
                    ),
                    const SizedBox(width: 4),
                  ],
                  Text(
                    isOnline ? l10n.get('online') : l10n.get('offline'),
                    style: GrsTypography.labelSmall(
                      color: Colors.white.withValues(alpha: 0.90),
                    ).copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Main heading
          Text(
            'Ready for Intake',
            style: GrsTypography.headlineLarge(
              color: Colors.white,
            ).copyWith(fontSize: 22),
          ),
          const SizedBox(height: 16),

          // CTA
          GrsBounceTouch(
            onTap: onStartAssessment,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.add_task_rounded,
                    size: 18,
                    color: GrsColors.primaryLight,
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      l10n.get('startNewAssessment'),
                      style: GrsTypography.labelMedium(
                        color: GrsColors.primaryLight,
                      ).copyWith(fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Search + Filter Row
// ────────────────────────────────────────────────────────────────────────────

class _SearchFilterRow extends StatelessWidget {
  const _SearchFilterRow({
    required this.controller,
    required this.selectedFilter,
    required this.onFilterChange,
    required this.onSearchChange,
    required this.l10n,
    required this.isDark,
  });

  final TextEditingController controller;
  final String selectedFilter;
  final ValueChanged<String> onFilterChange;
  final VoidCallback onSearchChange;
  final GrsL10n l10n;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Column(
        children: [
          // Search field
          TextField(
            controller: controller,
            decoration: InputDecoration(
              hintText: l10n.get('searchHousesHint'),
              prefixIcon: Icon(
                Icons.search_rounded,
                size: 20,
                color: isDark
                    ? GrsColors.textTertiaryDark
                    : GrsColors.textTertiaryLight,
              ),
              suffixIcon: controller.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear_rounded, size: 18),
                      onPressed: () {
                        controller.clear();
                        onSearchChange();
                      },
                    )
                  : null,
            ),
            onChanged: (_) => onSearchChange(),
          ),
          const SizedBox(height: 10),

          // Filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: l10n.get('filterAll'),
                  isSelected: selectedFilter == 'all',
                  onTap: () => onFilterChange('all'),
                  isDark: isDark,
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: l10n.get('filterInProgress'),
                  isSelected: selectedFilter == 'in_progress',
                  onTap: () => onFilterChange('in_progress'),
                  isDark: isDark,
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: l10n.get('filterCompleted'),
                  isSelected: selectedFilter == 'completed',
                  onTap: () => onFilterChange('completed'),
                  isDark: isDark,
                ),
              ],
            ),
          ),
          const SizedBox(height: 2),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
    required this.isDark,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final selectedBg = isDark
        ? GrsColors.primaryContainerDark
        : GrsColors.primaryContainerLight;
    final selectedInk = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;
    final unselectedBg = isDark
        ? GrsColors.surfaceVariantDark
        : GrsColors.surfaceVariantLight;
    final unselectedInk = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return GrsBounceTouch(
      onTap: onTap,
      haptic: false,
      child: AnimatedContainer(
        duration: GrsMotion.durationFast,
        curve: GrsMotion.curveEnter,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected ? selectedBg : unselectedBg,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style:
              GrsTypography.labelMedium(
                color: isSelected ? selectedInk : unselectedInk,
              ).copyWith(
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// House Card
// ────────────────────────────────────────────────────────────────────────────

class _HouseCard extends StatelessWidget {
  const _HouseCard({
    required this.houseId,
    required this.houseNo,
    required this.serialNo,
    required this.leader,
    required this.status,
    required this.l10n,
    required this.isDark,
    this.onRefresh,
  });

  final String houseId;
  final String houseNo;
  final int serialNo;
  final String leader;
  final String status;
  final GrsL10n l10n;
  final bool isDark;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final isCompleted = status == 'completed';
    final avatarBg = isCompleted
        ? (isDark ? GrsColors.syncSyncedBgDark : GrsColors.syncSyncedBg)
        : (isDark
              ? GrsColors.primaryContainerDark
              : GrsColors.primaryContainerLight);
    final avatarInk = isCompleted
        ? GrsColors.syncSynced
        : (isDark ? GrsColors.primaryDark : GrsColors.primaryLight);

    return GrsCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        onTap: () async {
          await context.push('/houses/$houseId');
          onRefresh?.call();
        },
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: avatarBg,
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Text(
            '$serialNo',
            style: GrsTypography.titleMedium(
              color: avatarInk,
            ).copyWith(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
        title: Text(
          '${l10n.get('houseNumber')}: $houseNo',
          style: GrsTypography.titleMedium(
            color: isDark
                ? GrsColors.textPrimaryDark
                : GrsColors.textPrimaryLight,
          ).copyWith(fontSize: 15),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          leader,
          style: GrsTypography.bodyMedium(
            color: isDark
                ? GrsColors.textSecondaryDark
                : GrsColors.textSecondaryLight,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: _buildStatusBadge(status, l10n),
      ),
    );
  }

  Widget _buildStatusBadge(String status, GrsL10n l10n) {
    if (status == 'completed') {
      return const GrsSyncBadge(status: GrsSyncStatus.synced, label: 'Done');
    }
    if (status == 'in_progress') {
      return const GrsSyncBadge(
        status: GrsSyncStatus.pending,
        label: 'In Progress',
      );
    }
    return const GrsSyncBadge(status: GrsSyncStatus.draft, label: 'Draft');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Empty State
// ────────────────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.downloadProgress,
    required this.onDownload,
    required this.l10n,
    required this.isDark,
  });

  final dynamic downloadProgress;
  final VoidCallback onDownload;
  final GrsL10n l10n;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return GrsFadeIn(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.home_work_outlined,
                size: 64,
                color: isDark
                    ? GrsColors.textTertiaryDark
                    : GrsColors.textTertiaryLight,
              ),
              const SizedBox(height: 16),
              Text(
                'No houses in this area',
                style: GrsTypography.titleMedium(
                  color: isDark
                      ? GrsColors.textPrimaryDark
                      : GrsColors.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Download area data to begin field work.',
                style: GrsTypography.bodyMedium(color: secondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              GrsButton(
                label: downloadProgress.isDownloading
                    ? l10n.get('downloadingArea')
                    : l10n.get('downloadAreaButton'),
                icon: downloadProgress.isDownloading
                    ? null
                    : Icons.download_rounded,
                isLoading: downloadProgress.isDownloading,
                onPressed: downloadProgress.isDownloading ? null : onDownload,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton Loading Cards
// ────────────────────────────────────────────────────────────────────────────

Widget _buildLoadingSkeletons(bool isDark) {
  return ListView.builder(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
    itemCount: 4,
    itemBuilder: (context, index) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _SkeletonCard(isDark: isDark),
      );
    },
  );
}

class _SkeletonCard extends StatefulWidget {
  final bool isDark;
  const _SkeletonCard({required this.isDark});

  @override
  State<_SkeletonCard> createState() => _SkeletonCardState();
}

class _SkeletonCardState extends State<_SkeletonCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    final isTest = WidgetsBinding.instance.runtimeType.toString().contains(
      'Test',
    );
    if (!isTest) {
      _pulseCtrl.repeat(reverse: true);
    }
    _pulse = Tween<double>(
      begin: 0.45,
      end: 0.95,
    ).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shimmerColor = widget.isDark
        ? GrsColors.surfaceVariantDark
        : GrsColors.surfaceVariantLight;

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        return Opacity(
          opacity: _pulse.value,
          child: GrsCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: shimmerColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        height: 14,
                        width: 110,
                        decoration: BoxDecoration(
                          color: shimmerColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        height: 12,
                        width: 170,
                        decoration: BoxDecoration(
                          color: shimmerColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  height: 22,
                  width: 58,
                  decoration: BoxDecoration(
                    color: shimmerColor,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Level 4 Management Hub
// ────────────────────────────────────────────────────────────────────────────

class _Level4Hub extends ConsumerWidget {
  const _Level4Hub({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = GrsL10n.of(context);
    final authState = ref.watch(authProvider);
    final profile = authState.profile;
    final assignments = profile?.assignments ?? [];
    final openDuplicatesCount =
        ref.watch(teamOpenDuplicatesCountProvider).valueOrNull ?? 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.admin_panel_settings_outlined,
                  size: 18,
                  color: GrsColors.primaryDark,
                ),
                const SizedBox(width: 8),
                Text(
                  'Level 4 Management',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : GrsColors.textPrimaryLight,
                  ),
                ),
                if (assignments.length > 1) ...[
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF0F172A) : Colors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF334155)
                            : const Color(0xFFCBD5E1),
                      ),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: assignments.any((a) => a.gnId == profile?.gnId)
                            ? profile?.gnId
                            : null,
                        isDense: true,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isDark ? Colors.white : GrsColors.primaryDark,
                        ),
                        items: assignments.map((a) {
                          final name =
                              a.gnName ??
                              (a.gnCode != null
                                  ? 'GN ${a.gnCode}'
                                  : 'GN ${a.gnId.length > 6 ? a.gnId.substring(0, 6) : a.gnId}');
                          return DropdownMenuItem<String>(
                            value: a.gnId,
                            child: Text(name),
                          );
                        }).toList(),
                        onChanged: (newGnId) async {
                          if (newGnId != null && newGnId != profile?.gnId) {
                            try {
                              await ref
                                  .read(authProvider.notifier)
                                  .switchArea(newGnId);
                              ref
                                  .read(recordsRevisionProvider.notifier)
                                  .increment();
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Failed to switch area: $e'),
                                  ),
                                );
                              }
                            }
                          }
                        },
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _HubButton(
                    icon: Icons.location_city_outlined,
                    label: 'GN Setup',
                    onTap: () => context.push('/gn-setup'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.add_home_outlined,
                    label: 'Add House',
                    onTap: () => context.push('/houses/new'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.checklist_rtl_outlined,
                    label: 'Choose Houses',
                    onTap: () => context.push('/choose-houses'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.groups_outlined,
                    label: 'Members',
                    onTap: () => context.push('/team-members'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.insights_outlined,
                    label: 'Progress',
                    onTap: () => context.push('/team-progress'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.folder_shared_outlined,
                    label: 'Records',
                    onTap: () => context.push('/team-records'),
                    isDark: isDark,
                  ),
                  const SizedBox(width: 8),
                  _HubButton(
                    icon: Icons.copy_all_outlined,
                    label: l10n.get('duplicatesHubLabel'),
                    badgeCount: openDuplicatesCount,
                    onTap: () => context.push('/team-duplicates'),
                    isDark: isDark,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HubButton extends StatelessWidget {
  const _HubButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.isDark,
    this.badgeCount = 0,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDark;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F172A) : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: badgeCount > 0
                ? GrsColors.duplicateAlert
                : (isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1)),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: GrsColors.primaryDark),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white70 : GrsColors.textPrimaryLight,
              ),
            ),
            if (badgeCount > 0) ...[
              const SizedBox(width: 6),
              Container(
                key: const Key('l4_duplicates_badge'),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: GrsColors.duplicateAlert,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  badgeCount > 99 ? '99+' : '$badgeCount',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
