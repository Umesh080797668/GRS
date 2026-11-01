import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';

/// Screen for Level 4 (CDC Secretary) to view team progress metrics (M4.4).
///
/// Displays household completion rates, client/beneficiary demographics,
/// vulnerability flags, and member contributions.
/// Resilient to offline mode: displays local cached counts with clear banner.
class TeamProgressScreen extends ConsumerStatefulWidget {
  const TeamProgressScreen({super.key});

  @override
  ConsumerState<TeamProgressScreen> createState() => _TeamProgressScreenState();
}

class _TeamProgressScreenState extends ConsumerState<TeamProgressScreen> {
  bool _isLoading = true;
  String? _errorMessage;

  // Household stats
  int _totalHouses = 0;
  int _completedHouses = 0;
  int _inProgressHouses = 0;
  int _notStartedHouses = 0;

  // Beneficiary stats
  int _totalClients = 0;
  int _maleClients = 0;
  int _femaleClients = 0;
  int _specialNeedsClients = 0;
  int _samurdhiClients = 0;
  int _aswesumaClients = 0;
  int _youthClients = 0; // 18 - 35
  int _seniorClients = 0; // 60+

  // Member stats
  List<Map<String, dynamic>> _memberStats = [];

  @override
  void initState() {
    super.initState();
    _loadProgress();
  }

  Future<void> _loadProgress() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isOnline = ref.read(connectivityProvider);
    final auth = ref.read(authProvider);
    final teamId = auth.user?.teamId;

    try {
      // 1. First load local database records as fast baseline
      final db = await ref.read(databaseProvider.future);
      final localHouses = await db.getHouseholds();
      final localClients = await db.getAllClients();

      // Filter by team if teamId is available
      final teamHouses = teamId != null && teamId.isNotEmpty
          ? localHouses.where((h) => h['team_id'] == teamId).toList()
          : localHouses;

      int totalH = teamHouses.length;
      int compH = teamHouses.where((h) => h['status'] == 'completed').length;
      int inProgH = teamHouses
          .where((h) => h['status'] == 'in_progress')
          .length;
      int notStH = totalH - compH - inProgH;

      int totalC = localClients.length;
      int maleC = localClients
          .where((c) => (c['gender'] ?? '').toString().toLowerCase() == 'male')
          .length;
      int femaleC = localClients
          .where(
            (c) => (c['gender'] ?? '').toString().toLowerCase() == 'female',
          )
          .length;
      int specialC = localClients
          .where((c) => c['has_special_needs'] == 1)
          .length;
      int samurdhiC = localClients.where((c) => c['is_samurdhi'] == 1).length;
      int aswesumaC = localClients.where((c) => c['is_aswesuma'] == 1).length;
      int youthC = localClients.where((c) {
        final age = (c['age'] as int?) ?? 0;
        return age >= 18 && age <= 35;
      }).length;
      int seniorC = localClients.where((c) {
        final age = (c['age'] as int?) ?? 0;
        return age >= 60;
      }).length;

      // 2. If online, fetch from backend for global team view
      if (isOnline && teamId != null && teamId.isNotEmpty) {
        try {
          final apiClient = ref.read(apiClientProvider);

          // Fetch team clients
          final clientsRes = await apiClient.getClients(
            teamId: teamId,
            limit: 500,
          );
          final serverClients =
              (clientsRes['clients'] as List? ??
                      clientsRes['data'] as List? ??
                      [])
                  .whereType<Map<String, dynamic>>()
                  .toList();

          if (serverClients.isNotEmpty) {
            totalC = serverClients.length;
            maleC = serverClients
                .where(
                  (c) => (c['gender'] ?? '').toString().toLowerCase() == 'male',
                )
                .length;
            femaleC = serverClients
                .where(
                  (c) =>
                      (c['gender'] ?? '').toString().toLowerCase() == 'female',
                )
                .length;
            specialC = serverClients
                .where(
                  (c) =>
                      c['hasSpecialNeeds'] == true || c['hasSpecialNeeds'] == 1,
                )
                .length;
            samurdhiC = serverClients
                .where((c) => c['isSamurdhi'] == true || c['isSamurdhi'] == 1)
                .length;
            aswesumaC = serverClients
                .where((c) => c['isAswesuma'] == true || c['isAswesuma'] == 1)
                .length;
            youthC = serverClients.where((c) {
              final age = c['age'] is int
                  ? c['age'] as int
                  : int.tryParse('${c['age']}') ?? 0;
              return age >= 18 && age <= 35;
            }).length;
            seniorC = serverClients.where((c) {
              final age = c['age'] is int
                  ? c['age'] as int
                  : int.tryParse('${c['age']}') ?? 0;
              return age >= 60;
            }).length;
          }

          // Fetch team members
          final membersRes = await apiClient.getAccounts(teamId: teamId);
          final serverMembers =
              (membersRes['accounts'] as List? ??
                      membersRes['data'] as List? ??
                      [])
                  .whereType<Map<String, dynamic>>()
                  .toList();

          final Map<String, int> collectorCounts = {};
          for (final c in serverClients) {
            final collectorId = c['collectedBy'] ?? c['collectorId'] ?? '';
            if (collectorId.isNotEmpty) {
              collectorCounts[collectorId] =
                  (collectorCounts[collectorId] ?? 0) + 1;
            }
          }

          _memberStats = serverMembers.map((m) {
            final id = m['id'] ?? '';
            final count = collectorCounts[id] ?? 0;
            return {
              'fullName': m['fullName'] ?? 'Unnamed',
              'userCode': m['userCode'] ?? '',
              'role': m['role'] ?? 'team_member',
              'count': count,
              'isActive': m['isActive'] != false,
            };
          }).toList();
        } catch (_) {
          // Fallback to local counts if network call fails
        }
      }

      if (mounted) {
        setState(() {
          _totalHouses = totalH;
          _completedHouses = compH;
          _inProgressHouses = inProgH;
          _notStartedHouses = notStH < 0 ? 0 : notStH;

          _totalClients = totalC;
          _maleClients = maleC;
          _femaleClients = femaleC;
          _specialNeedsClients = specialC;
          _samurdhiClients = samurdhiC;
          _aswesumaClients = aswesumaC;
          _youthClients = youthC;
          _seniorClients = seniorC;

          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to calculate progress: ${e.toString()}';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = ref.watch(connectivityProvider);
    final double completionRate = _totalHouses > 0
        ? (_completedHouses / _totalHouses).clamp(0.0, 1.0)
        : 0.0;

    return GrsScaffold(
      title: 'Team Progress',
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage:
          'Offline. Showing locally cached progress. Connect to internet for synchronized totals.',
      body: _isLoading
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
                      color: GrsColors.syncRejected,
                      size: 48,
                    ),
                    const SizedBox(height: GrsSpacing.sm),
                    Text(
                      _errorMessage!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 14),
                    ),
                    const SizedBox(height: GrsSpacing.md),
                    ElevatedButton(
                      onPressed: _loadProgress,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _loadProgress,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(GrsSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Household Survey Completion Card
                    GrsCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Households Surveyed',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                '${(completionRate * 100).toStringAsFixed(1)}%',
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                  color: GrsColors.primaryLight,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: GrsSpacing.sm),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: completionRate,
                              minHeight: 10,
                              backgroundColor: GrsColors.outlineLight,
                              valueColor: const AlwaysStoppedAnimation<Color>(
                                GrsColors.syncSynced,
                              ),
                            ),
                          ),
                          const SizedBox(height: GrsSpacing.md),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _buildMetricItem(
                                'Total Houses',
                                '$_totalHouses',
                                GrsColors.textPrimaryLight,
                              ),
                              _buildMetricItem(
                                'Completed',
                                '$_completedHouses',
                                GrsColors.syncSynced,
                              ),
                              _buildMetricItem(
                                'In Progress',
                                '$_inProgressHouses',
                                GrsColors.syncPending,
                              ),
                              _buildMetricItem(
                                'Pending',
                                '$_notStartedHouses',
                                GrsColors.textSecondaryLight,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Beneficiaries Summary Card
                    GrsCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.people_outline,
                                color: GrsColors.primaryLight,
                              ),
                              const SizedBox(width: GrsSpacing.sm),
                              const Text(
                                'Beneficiaries Registered',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                '$_totalClients Total',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: GrsColors.primaryLight,
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: GrsSpacing.lg),
                          Row(
                            children: [
                              Expanded(
                                child: _buildDetailTile(
                                  icon: Icons.man,
                                  label: 'Male',
                                  value: '$_maleClients',
                                ),
                              ),
                              Expanded(
                                child: _buildDetailTile(
                                  icon: Icons.woman,
                                  label: 'Female',
                                  value: '$_femaleClients',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: GrsSpacing.sm),
                          Row(
                            children: [
                              Expanded(
                                child: _buildDetailTile(
                                  icon: Icons.school_outlined,
                                  label: 'Youth (18-35)',
                                  value: '$_youthClients',
                                ),
                              ),
                              Expanded(
                                child: _buildDetailTile(
                                  icon: Icons.elderly_outlined,
                                  label: 'Seniors (60+)',
                                  value: '$_seniorClients',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Vulnerability & Welfare Programs
                    GrsCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(
                                Icons.health_and_safety_outlined,
                                color: GrsColors.syncPending,
                              ),
                              SizedBox(width: GrsSpacing.sm),
                              Text(
                                'Vulnerability & Welfare Flags',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: GrsSpacing.lg),
                          _buildVulnerabilityRow(
                            'Special Needs / Disability',
                            _specialNeedsClients,
                            _totalClients,
                            GrsColors.syncPending,
                          ),
                          const SizedBox(height: GrsSpacing.sm),
                          _buildVulnerabilityRow(
                            'Samurdhi Beneficiaries',
                            _samurdhiClients,
                            _totalClients,
                            GrsColors.primaryMid,
                          ),
                          const SizedBox(height: GrsSpacing.sm),
                          _buildVulnerabilityRow(
                            'Aswesuma Beneficiaries',
                            _aswesumaClients,
                            _totalClients,
                            GrsColors.syncSynced,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Team Member Contributions
                    if (_memberStats.isNotEmpty) ...[
                      const Text(
                        'Member Contributions',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.sm),
                      ..._memberStats.map((m) {
                        final name = m['fullName'] ?? 'Member';
                        final userCode = m['userCode'] ?? '';
                        final count = m['count'] ?? 0;
                        return GrsCard(
                          margin: const EdgeInsets.only(bottom: GrsSpacing.xs),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: GrsColors.primaryLight
                                  .withValues(alpha: 0.15),
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : 'M',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            title: Text(
                              name,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            subtitle: Text('ID: $userCode'),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: GrsColors.primaryMid.withValues(
                                  alpha: 0.12,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '$count Records',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: GrsColors.primaryLight,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildMetricItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: GrsColors.textSecondaryLight,
          ),
        ),
      ],
    );
  }

  Widget _buildDetailTile({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: GrsColors.textSecondaryLight),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: GrsColors.textSecondaryLight,
              ),
            ),
            Text(
              value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildVulnerabilityRow(
    String title,
    int count,
    int total,
    Color color,
  ) {
    final double pct = total > 0 ? (count / total).clamp(0.0, 1.0) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: const TextStyle(fontSize: 13)),
            Text(
              '$count (${(pct * 100).toStringAsFixed(1)}%)',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 6,
            backgroundColor: GrsColors.outlineLight,
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
    );
  }
}
