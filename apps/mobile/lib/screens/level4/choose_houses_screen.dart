import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';

class ChooseHousesScreen extends ConsumerStatefulWidget {
  const ChooseHousesScreen({super.key});

  @override
  ConsumerState<ChooseHousesScreen> createState() => _ChooseHousesScreenState();
}

class _ChooseHousesScreenState extends ConsumerState<ChooseHousesScreen> {
  final _searchCtrl = TextEditingController();
  String _selectedFilter = 'all'; // 'all', 'available', 'my_team', 'taken'

  bool _isLoading = true;
  String? _errorMessage;
  List<Map<String, dynamic>> _houses = [];
  final Set<String> _selectedHouseIds = {};
  bool _isClaiming = false;

  @override
  void initState() {
    super.initState();
    _fetchHouses();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchHouses() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _selectedHouseIds.clear();
    });

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      setState(() {
        _isLoading = false;
        _errorMessage = GrsL10n.of(context).get('internetRequiredHouses');
      });
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final gnId = auth.user?.gnId;
      if (gnId == null || gnId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = GrsL10n.of(context).get('noGnDivisionAssigned');
        });
        return;
      }

      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.getHouseholds(gnId: gnId, limit: 100);
      final rawList = response['households'] as List<dynamic>? ?? [];
      final allHouses = List<Map<String, dynamic>>.from(
        rawList.cast<Map<String, dynamic>>(),
      );

      String? cursor = response['nextCursor'] as String?;
      while (cursor != null && cursor.isNotEmpty) {
        final nextResponse = await apiClient.getHouseholds(
          gnId: gnId,
          cursor: cursor,
          limit: 100,
        );
        final nextList = nextResponse['households'] as List<dynamic>? ?? [];
        allHouses.addAll(nextList.cast<Map<String, dynamic>>());
        cursor = nextResponse['nextCursor'] as String?;
      }

      if (mounted) {
        setState(() {
          _houses = allHouses;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = GrsL10n.of(
            context,
          ).translate('failedToLoadHouses', {'error': e.toString()});
        });
      }
    }
  }

  Future<void> _claimSelectedHouses() async {
    if (_selectedHouseIds.isEmpty) return;

    final auth = ref.read(authProvider);
    final teamId = auth.user?.teamId;
    if (teamId == null || teamId.isEmpty) {
      final l10n = GrsL10n.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.get('noTeamAssigned')),
          backgroundColor: GrsColors.syncRejected,
        ),
      );
      return;
    }

    setState(() => _isClaiming = true);

    try {
      final apiClient = ref.read(apiClientProvider);
      final res = await apiClient.assignHousesToTeam(
        teamId,
        _selectedHouseIds.toList(),
      );

      final count = res['assignedCount'] ?? _selectedHouseIds.length;
      if (mounted) {
        final l10n = GrsL10n.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('housesClaimedSuccess', {'count': '$count'}),
            ),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
        _fetchHouses();
      }
    } on GrsApiException catch (apiErr) {
      if (apiErr.statusCode == 409) {
        // Race condition conflict: another team took house(s)
        final unavailable =
            (apiErr.details['unavailableHouseIds'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [];

        if (mounted) {
          final dlgL10n = GrsL10n.of(context);
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              title: Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: GrsColors.syncRejected,
                  ),
                  const SizedBox(width: 8),
                  Text(dlgL10n.get('claimConflictTitle')),
                ],
              ),
              content: Text(
                dlgL10n.translate('claimConflictMessage', {
                  'count': '${unavailable.length}',
                }),
              ),
              actions: [
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    _fetchHouses();
                  },
                  child: Text(dlgL10n.get('refreshList')),
                ),
              ],
            ),
          );
        }
      } else {
        if (mounted) {
          final l10n = GrsL10n.of(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                l10n.translate('errorClaimingHouses', {
                  'error': apiErr.messageKey,
                }),
              ),
              backgroundColor: GrsColors.syncRejected,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        final l10n = GrsL10n.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('errorClaimingHouses', {'error': e.toString()}),
            ),
            backgroundColor: GrsColors.syncRejected,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isClaiming = false);
      }
    }
  }

  Future<void> _unassignHouse(String houseId, String houseNo) async {
    final auth = ref.read(authProvider);
    final teamId = auth.user?.teamId;
    if (teamId == null) return;

    final dlgL10n = GrsL10n.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(dlgL10n.get('unassignHouseTitle')),
        content: Text(
          dlgL10n.translate('unassignHouseConfirm', {'houseNo': houseNo}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(dlgL10n.get('cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: GrsColors.syncRejected,
            ),
            child: Text(dlgL10n.get('unassign')),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.unassignHouseFromTeam(teamId, houseId);
      if (mounted) {
        final l10n = GrsL10n.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('houseUnassignedSuccess', {'houseNo': houseNo}),
            ),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
        _fetchHouses();
      }
    } catch (e) {
      if (mounted) {
        final l10n = GrsL10n.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('failedToUnassignHouse', {'error': e.toString()}),
            ),
            backgroundColor: GrsColors.syncRejected,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final isOnline = ref.watch(connectivityProvider);
    final auth = ref.watch(authProvider);
    final myTeamId = auth.user?.teamId;

    // Filter houses
    final search = _searchCtrl.text.trim().toLowerCase();
    final filtered = _houses.where((h) {
      final houseNo = (h['houseNo'] as String? ?? '').toLowerCase();
      final leader = (h['houseLeaderName'] as String? ?? '').toLowerCase();
      final village = (h['villageName'] as String? ?? '').toLowerCase();

      final matchesSearch =
          search.isEmpty ||
          houseNo.contains(search) ||
          leader.contains(search) ||
          village.contains(search);

      if (!matchesSearch) return false;

      final teamId = h['teamId'] as String?;
      final isMyTeam = myTeamId != null && teamId == myTeamId;
      final isAvailable = teamId == null;
      final isTakenByOther = teamId != null && !isMyTeam;

      switch (_selectedFilter) {
        case 'available':
          return isAvailable;
        case 'my_team':
          return isMyTeam;
        case 'taken':
          return isTakenByOther;
        default:
          return true;
      }
    }).toList();

    return GrsScaffold(
      title: l10n.get('chooseHouses'),
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage: l10n.get('onlineOnlyNotice'),
      body: Column(
        children: [
          // Search & Filters Header
          Padding(
            padding: const EdgeInsets.all(GrsSpacing.md),
            child: Column(
              children: [
                TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: l10n.get('searchHousesHint'),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchCtrl.clear();
                              setState(() {});
                            },
                          )
                        : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: GrsSpacing.sm),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      FilterChip(
                        label: Text(
                          '${l10n.get('allTab')} (${_houses.length})',
                        ),
                        selected: _selectedFilter == 'all',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'all'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          '${l10n.get('filterAvailable')} (${_houses.where((h) => h['teamId'] == null).length})',
                        ),
                        selected: _selectedFilter == 'available',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'available'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          '${l10n.get('filterMyTeam')} (${_houses.where((h) => h['teamId'] == myTeamId).length})',
                        ),
                        selected: _selectedFilter == 'my_team',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'my_team'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          '${l10n.get('filterTaken')} (${_houses.where((h) => h['teamId'] != null && h['teamId'] != myTeamId).length})',
                        ),
                        selected: _selectedFilter == 'taken',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'taken'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // Houses List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(GrsSpacing.lg),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 48,
                            color: GrsColors.syncRejected,
                          ),
                          const SizedBox(height: 8),
                          Text(_errorMessage!, textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          GrsButton(
                            label: l10n.get('retry'),
                            onPressed: _fetchHouses,
                          ),
                        ],
                      ),
                    ),
                  )
                : filtered.isEmpty
                ? Center(child: Text(l10n.get('noHousesFound')))
                : RefreshIndicator(
                    onRefresh: _fetchHouses,
                    child: ListView.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, idx) {
                        final h = filtered[idx];
                        final id = h['id'] as String;
                        final houseNo = h['houseNo'] as String? ?? '';
                        final leader = h['houseLeaderName'] as String? ?? '';
                        final serialNo = h['serialNo'];
                        final teamId = h['teamId'] as String?;
                        final isMyTeam = myTeamId != null && teamId == myTeamId;
                        final isAvailable = teamId == null;
                        final isTakenByOther = teamId != null && !isMyTeam;
                        final teamNo = h['team']?['teamNo'];

                        final isSelected = _selectedHouseIds.contains(id);

                        return CheckboxListTile(
                          value: isMyTeam ? true : isSelected,
                          onChanged: isAvailable && isOnline && !_isClaiming
                              ? (bool? val) {
                                  setState(() {
                                    if (val == true) {
                                      _selectedHouseIds.add(id);
                                    } else {
                                      _selectedHouseIds.remove(id);
                                    }
                                  });
                                }
                              : null,
                          title: Row(
                            children: [
                              Text(
                                '${l10n.get('houseNumber')}: $houseNo',
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '#$serialNo',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: GrsColors.textSecondaryLight,
                                ),
                              ),
                              const Spacer(),
                              if (isMyTeam)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: GrsColors.syncSynced.withValues(
                                      alpha: 0.15,
                                    ),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: GrsColors.syncSynced,
                                    ),
                                  ),
                                  child: Text(
                                    l10n.get('filterMyTeam'),
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: GrsColors.syncSynced,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                )
                              else if (isTakenByOther)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.grey),
                                  ),
                                  child: Text(
                                    teamNo != null
                                        ? l10n.translate('teamBadge', {
                                            'teamNo': '$teamNo',
                                          })
                                        : l10n.get('filterTaken'),
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                )
                              else
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: GrsColors.primaryMid.withValues(
                                      alpha: 0.12,
                                    ),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    l10n.get('filterAvailable'),
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: GrsColors.primaryLight,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          subtitle: Text(
                            leader,
                            style: const TextStyle(
                              fontSize: 12,
                              color: GrsColors.textSecondaryLight,
                            ),
                          ),
                          secondary: isMyTeam
                              ? IconButton(
                                  icon: const Icon(
                                    Icons.link_off,
                                    color: GrsColors.syncRejected,
                                  ),
                                  tooltip: l10n.get('unassignFromTeamTooltip'),
                                  onPressed: isOnline
                                      ? () => _unassignHouse(id, houseNo)
                                      : null,
                                )
                              : null,
                        );
                      },
                    ),
                  ),
          ),
          // Bottom Claim Bar
          if (_selectedHouseIds.isNotEmpty)
            SafeArea(
              child: Container(
                padding: const EdgeInsets.all(GrsSpacing.md),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black12,
                      blurRadius: 4,
                      offset: Offset(0, -2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.translate('housesSelected', {
                          'count': '${_selectedHouseIds.length}',
                        }),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    GrsButton(
                      label: _isClaiming
                          ? '...'
                          : l10n.get('claimSelectedHouses'),
                      icon: Icons.check,
                      onPressed: isOnline && !_isClaiming
                          ? _claimSelectedHouses
                          : null,
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
