import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/area_download_provider.dart';
import '../../providers/database_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with SingleTickerProviderStateMixin {
  final _searchController = TextEditingController();
  String _selectedFilter = 'all';
  bool _isSyncing = false;
  late final AnimationController _syncRotateController;

  @override
  void initState() {
    super.initState();
    _syncRotateController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _syncRotateController.dispose();
    super.dispose();
  }

  Future<void> _downloadArea() async {
    await ref.read(areaDownloadProgressProvider.notifier).startDownload();
    if (!mounted) return;
    final state = ref.read(areaDownloadProgressProvider);
    if (state.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Download failed: ${state.error}'),
          backgroundColor: GrsColors.syncRejected,
        ),
      );
    } else if (state.isCompleted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Area data loaded successfully.')),
      );
      setState(() {});
    }
  }

  void _triggerSync() async {
    setState(() => _isSyncing = true);
    _syncRotateController.repeat();
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) {
      _syncRotateController.stop();
      _syncRotateController.reset();
      setState(() => _isSyncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final dbAsync = ref.watch(databaseProvider);
    final downloadProgress = ref.watch(areaDownloadProgressProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          l10n.get('appTitle'),
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          IconButton(
            icon: RotationTransition(
              turns: _syncRotateController,
              child: const Icon(Icons.sync_rounded),
            ),
            tooltip: l10n.get('syncNow'),
            onPressed: _isSyncing ? null : _triggerSync,
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Hero Gradient Banner
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: GrsColors.heroGradient,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: GrsColors.primaryLight.withValues(alpha: 0.35),
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: Text(
                              l10n.get('fieldWorkStatus'),
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(
                                    color: GrsColors.syncSynced,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                const Text(
                                  'Online',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Ready for Intake',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      GrsButton(
                        label: l10n.get('startNewAssessment'),
                        icon: Icons.add_task_rounded,
                        variant: GrsButtonVariant.primary,
                        size: GrsButtonSize.medium,
                        onPressed: () => context.push('/client/consent'),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // Search Bar with Floating Style
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: l10n.get('searchHousesHint'),
                    prefixIcon: const Icon(Icons.search_rounded, size: 22),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear_rounded, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() {});
                            },
                          )
                        : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),

                const SizedBox(height: 10),

                // Animated Filter Chips Bar
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip('all', l10n.get('filterAll')),
                      const SizedBox(width: 8),
                      _buildFilterChip(
                        'in_progress',
                        l10n.get('filterInProgress'),
                      ),
                      const SizedBox(width: 8),
                      _buildFilterChip(
                        'completed',
                        l10n.get('filterCompleted'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Houses List View (Virtualized)
          Expanded(
            child: dbAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Database error: $err')),
              data: (db) {
                return FutureBuilder<List<Map<String, dynamic>>>(
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
                      return const Center(child: CircularProgressIndicator());
                    }
                    final households = snapshot.data!;

                    if (households.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.home_work_outlined,
                              size: 56,
                              color: Colors.grey,
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'No houses found in this area.',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton.icon(
                              icon: downloadProgress.isDownloading
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.download),
                              label: Text(
                                downloadProgress.isDownloading
                                    ? l10n.get('downloadingArea')
                                    : l10n.get('downloadAreaButton'),
                              ),
                              onPressed: downloadProgress.isDownloading
                                  ? null
                                  : _downloadArea,
                            ),
                          ],
                        ),
                      );
                    }

                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 4,
                      ),
                      itemCount: households.length,
                      itemBuilder: (context, index) {
                        final h = households[index];
                        final houseId = h['id'] as String;
                        final houseNo = h['house_no'] as String;
                        final serialNo = h['serial_no'] as int;
                        final leader = h['house_leader_name'] as String;
                        final status = h['status'] as String? ?? 'not_started';

                        return GrsFadeSlideItem(
                          index: index < 15 ? index : 0,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: GrsCard(
                              onTap: () => context.push('/houses/$houseId'),
                              child: ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: status == 'completed'
                                        ? GrsColors.syncSyncedBg
                                        : GrsColors.primaryContainerLight,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    '$serialNo',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: status == 'completed'
                                          ? GrsColors.syncSynced
                                          : GrsColors.primaryLight,
                                    ),
                                  ),
                                ),
                                title: Text(
                                  '${l10n.get('houseNumber')}: $houseNo (HN-$serialNo)',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15,
                                  ),
                                ),
                                subtitle: Text(
                                  '${l10n.get('houseLeader')}: $leader',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.65),
                                    fontSize: 13,
                                  ),
                                ),
                                trailing: _buildStatusBadge(status, l10n),
                              ),
                            ),
                          ),
                        );
                      },
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

  Widget _buildFilterChip(String filterId, String label) {
    final isSelected = _selectedFilter == filterId;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        showCheckmark: false,
        onSelected: (selected) {
          if (selected) setState(() => _selectedFilter = filterId);
        },
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
        label: 'Pending',
      );
    }
    return const GrsSyncBadge(status: GrsSyncStatus.draft, label: 'Draft');
  }
}
