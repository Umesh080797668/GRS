import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/area_download_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';
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
  bool _isSyncing = false;

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
          const SnackBar(content: Text('Area data loaded successfully.')),
        );
        setState(() {});
      }
    }
  }

  Future<void> _triggerSync() async {
    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Device is offline. Turn off Airplane mode or connect to a network to sync.',
          ),
          backgroundColor: Color(0xFFB45309),
        ),
      );
      return;
    }
    setState(() => _isSyncing = true);
    _syncCtrl.repeat();

    try {
      final ok = await ref.read(syncProvider.notifier).sync();
      final syncState = ref.read(syncProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              syncState.lastMessage ??
                  (ok ? 'Sync completed.' : 'Sync paused.'),
            ),
            backgroundColor: ok
                ? GrsColors.syncSynced
                : const Color(0xFFB45309),
          ),
        );
      }
    } finally {
      if (mounted) {
        _syncCtrl.stop();
        _syncCtrl.reset();
        setState(() => _isSyncing = false);
      }
    }
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
            onTap: _isSyncing ? null : _triggerSync,
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
                    color: _isSyncing ? theme.colorScheme.primary : secondary,
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
              onStartAssessment: () async {
                await context.push('/client/consent');
                ref.read(recordsRevisionProvider.notifier).increment();
              },
            ),
          ),

          // ── Offline Mode Notice Banner ─────────────────────────────────────
          if (!isOnline) ...[
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
                    'households_${_selectedFilter}_${_searchController.text}_$revision',
                  ),
                  future: db.getHouseholds(
                    search: _searchController.text.trim().isEmpty
                        ? null
                        : _searchController.text.trim(),
                    statusFilter: _selectedFilter == 'all'
                        ? null
                        : _selectedFilter,
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
