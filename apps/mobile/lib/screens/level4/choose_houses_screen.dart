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
        _errorMessage =
            'Internet connection required to view and select houses.';
      });
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final gnId = auth.user?.gnId;
      if (gnId == null || gnId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'No GN division assigned to this user.';
        });
        return;
      }

      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.getHouseholds(gnId: gnId, limit: 200);
      final rawList = response['households'] as List<dynamic>? ?? [];

      if (mounted) {
        setState(() {
          _houses = rawList.cast<Map<String, dynamic>>();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load houses: ${e.toString()}';
        });
      }
    }
  }

  Future<void> _claimSelectedHouses() async {
    if (_selectedHouseIds.isEmpty) return;

    final auth = ref.read(authProvider);
    final teamId = auth.user?.teamId;
    if (teamId == null || teamId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No team assigned to your account.'),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Successfully claimed $count houses for your team.'),
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
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Row(
                children: [
                  Icon(
                    Icons.warning_amber_rounded,
                    color: GrsColors.syncRejected,
                  ),
                  SizedBox(width: 8),
                  Text('Claim Conflict'),
                ],
              ),
              content: Text(
                'One or more houses could not be claimed because they were already taken by another team.\n\n'
                'Unavailable House IDs: ${unavailable.length}\n\n'
                'The list will now refresh.',
              ),
              actions: [
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    _fetchHouses();
                  },
                  child: const Text('Refresh List'),
                ),
              ],
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error claiming houses: ${apiErr.messageKey}'),
              backgroundColor: GrsColors.syncRejected,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error claiming houses: ${e.toString()}'),
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

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unassign House'),
        content: Text('Unassign House $houseNo from your team?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: GrsColors.syncRejected,
            ),
            child: const Text('Unassign'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.unassignHouseFromTeam(teamId, houseId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('House $houseNo unassigned.'),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
        _fetchHouses();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to unassign house: ${e.toString()}'),
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
                    hintText: 'Search by house no. or leader name',
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
                        label: Text('All (${_houses.length})'),
                        selected: _selectedFilter == 'all',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'all'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          'Available (${_houses.where((h) => h['teamId'] == null).length})',
                        ),
                        selected: _selectedFilter == 'available',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'available'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          'My Team (${_houses.where((h) => h['teamId'] == myTeamId).length})',
                        ),
                        selected: _selectedFilter == 'my_team',
                        onSelected: (_) =>
                            setState(() => _selectedFilter = 'my_team'),
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: Text(
                          'Other Teams (${_houses.where((h) => h['teamId'] != null && h['teamId'] != myTeamId).length})',
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
                          GrsButton(label: 'Retry', onPressed: _fetchHouses),
                        ],
                      ),
                    ),
                  )
                : filtered.isEmpty
                ? const Center(child: Text('No houses matching filter.'))
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
                                'House $houseNo',
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
                                  child: const Text(
                                    'My Team',
                                    style: TextStyle(
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
                                    teamNo != null ? 'Team $teamNo' : 'Taken',
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
                                  child: const Text(
                                    'Available',
                                    style: TextStyle(
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
                                  tooltip: 'Unassign from team',
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
                        '${_selectedHouseIds.length} houses selected',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    GrsButton(
                      label: _isClaiming ? 'Claiming...' : 'Claim for Team',
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
