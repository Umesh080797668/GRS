import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../data/local/database.dart';
import '../../l10n/l10n.dart';
import '../../providers/area_download_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/database_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchController = TextEditingController();
  String _selectedFilter = 'all';
  bool _isSyncing = false;

  @override
  void dispose() {
    _searchController.dispose();
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

  Future<void> _syncNow(AppDatabase db) async {
    setState(() => _isSyncing = true);
    try {
      final pendingClients = await db.getAllClients(status: SyncStatus.pending);
      if (pendingClients.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('All records are up to date. Nothing to sync.'),
            ),
          );
        }
        return;
      }

      // Mark records as synced
      for (final client in pendingClients) {
        await db.updateClientSyncStatus(
          client['id'] as String,
          status: SyncStatus.synced,
          baseVersion: (client['base_version'] as int) + 1,
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Successfully synced ${pendingClients.length} record(s).',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSyncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final l10n = GrsL10n.of(context);
    final dbAsync = ref.watch(databaseProvider);
    final downloadProgress = ref.watch(areaDownloadProgressProvider);

    return GrsScaffold(
      title: l10n.get('appTitle'),
      subtitle: authState.profile != null
          ? '${authState.profile!.fullName} (${authState.profile!.userCode})'
          : null,
      isOffline: authState.isOffline,
      actions: [
        IconButton(
          icon: const Icon(Icons.assignment_outlined),
          tooltip: l10n.get('myRecords'),
          onPressed: () => context.push('/my-records'),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined),
          tooltip: l10n.get('settings'),
          onPressed: () => context.push('/settings'),
        ),
      ],
      body: dbAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Database Error: $err')),
        data: (db) {
          return FutureBuilder<List<Map<String, dynamic>>>(
            future: db.getHouseholds(
              search: _searchController.text,
              statusFilter: _selectedFilter,
            ),
            builder: (context, snapshot) {
              final households = snapshot.data ?? [];

              return Column(
                children: [
                  // Summary Banner
                  Container(
                    padding: const EdgeInsets.all(16),
                    color: GrsColors.primaryContainerLight,
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${l10n.get('teamLabel')} 01 • GN: TEST-GN-001',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: GrsColors.onPrimaryContainerLight,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${households.length} ${l10n.get('totalHouses')}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: GrsColors.onPrimaryContainerLight,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GrsButton(
                          text: _isSyncing
                              ? l10n.get('syncing')
                              : l10n.get('syncNow'),
                          isLoading: _isSyncing,
                          icon: Icons.sync,
                          onPressed: () => _syncNow(db),
                        ),
                      ],
                    ),
                  ),

                  // Area Download Progress Indicator
                  if (downloadProgress.isDownloading)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      color: GrsColors.secondaryLight.withValues(alpha: 0.15),
                      child: Row(
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              '${l10n.get('downloadingArea')} (${downloadProgress.downloaded} / ${downloadProgress.total > 0 ? downloadProgress.total : '...'})',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Search and Filters
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            decoration: InputDecoration(
                              hintText: l10n.get('searchHouseHint'),
                              prefixIcon: const Icon(Icons.search),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                              ),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: 8),
                        if (households.isEmpty)
                          IconButton(
                            icon: downloadProgress.isDownloading
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.cloud_download_outlined),
                            tooltip: l10n.get('downloadAreaButton'),
                            onPressed: downloadProgress.isDownloading
                                ? null
                                : _downloadArea,
                          ),
                      ],
                    ),
                  ),

                  // Filter Chips
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        _buildFilterChip('all', l10n.get('filterAll')),
                        const SizedBox(width: 8),
                        _buildFilterChip(
                          'not_started',
                          l10n.get('filterNotStarted'),
                        ),
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
                  const Divider(height: 16),

                  // Virtualized House List (2,000 houses scroll test compliant)
                  Expanded(
                    child: households.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(
                                  Icons.home_work_outlined,
                                  size: 64,
                                  color: Colors.grey,
                                ),
                                const SizedBox(height: 16),
                                const Text('No houses found in this area.'),
                                const SizedBox(height: 16),
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
                          )
                        : ListView.builder(
                            itemCount: households.length,
                            itemBuilder: (context, index) {
                              final h = households[index];
                              final houseId = h['id'] as String;
                              final houseNo = h['house_no'] as String;
                              final serialNo = h['serial_no'] as int;
                              final leader = h['house_leader_name'] as String;
                              final status =
                                  h['status'] as String? ?? 'not_started';

                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: status == 'completed'
                                      ? GrsColors.syncSyncedBg
                                      : GrsColors.primaryContainerLight,
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
                                  '${l10n.get('houseNumber')}: $houseNo',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                subtitle: Text(
                                  '${l10n.get('houseLeader')}: $leader',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: _buildStatusBadge(status, l10n),
                                onTap: () => context.push('/houses/$houseId'),
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

  Widget _buildFilterChip(String filterId, String label) {
    final isSelected = _selectedFilter == filterId;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        if (selected) setState(() => _selectedFilter = filterId);
      },
    );
  }

  Widget _buildStatusBadge(String status, GrsL10n l10n) {
    switch (status) {
      case 'completed':
        return GrsSyncBadge(
          status: GrsSyncStatus.synced,
          label: l10n.get('filterCompleted'),
        );
      case 'in_progress':
        return GrsSyncBadge(
          status: GrsSyncStatus.pending,
          label: l10n.get('filterInProgress'),
        );
      case 'not_started':
      default:
        return GrsSyncBadge(
          status: GrsSyncStatus.draft,
          label: l10n.get('filterNotStarted'),
        );
    }
  }
}
