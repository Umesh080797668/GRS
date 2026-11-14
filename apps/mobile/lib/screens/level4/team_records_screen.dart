import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';

/// Screen for Level 4 (CDC Secretary) to view and correct team client records (M4.4, Decision C2/C13).
///
/// Offline resilient: displays locally saved records when disconnected.
/// When online, allows supervisor corrections with mandatory audit trail reason.
class TeamRecordsScreen extends ConsumerStatefulWidget {
  const TeamRecordsScreen({super.key});

  @override
  ConsumerState<TeamRecordsScreen> createState() => _TeamRecordsScreenState();
}

class _TeamRecordsScreenState extends ConsumerState<TeamRecordsScreen> {
  final _searchCtrl = TextEditingController();
  String _selectedFilter =
      'all'; // 'all', 'special_needs', 'samurdhi', 'aswesuma'

  bool _isLoading = true;
  String? _errorMessage;
  List<Map<String, dynamic>> _records = [];

  @override
  void initState() {
    super.initState();
    _fetchRecords();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchRecords() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isOnline = ref.read(connectivityProvider);
    final auth = ref.read(authProvider);
    final teamId = auth.user?.teamId;
    final gnId = auth.user?.gnId;
    final hasRemoteScope = (teamId != null && teamId.isNotEmpty) ||
        (gnId != null && gnId.isNotEmpty);

    String? serverWarning;

    if (isOnline && hasRemoteScope) {
      try {
        final apiClient = ref.read(apiClientProvider);
        final response = await apiClient.getClients(
          teamId: (teamId != null && teamId.isNotEmpty) ? teamId : null,
          gnId: (teamId == null || teamId.isEmpty) ? gnId : null,
          search: _searchCtrl.text.trim().isNotEmpty
              ? _searchCtrl.text.trim()
              : null,
          limit: 100,
        );

        final clientList =
            (response['clients'] as List? ?? response['data'] as List? ?? [])
                .whereType<Map<String, dynamic>>()
                .toList();

        final visitedCursors = <String>{};
        String? cursor = response['nextCursor'] as String?;
        int pageCount = 0;
        while (cursor != null &&
            cursor.isNotEmpty &&
            !visitedCursors.contains(cursor) &&
            pageCount < 50) {
          pageCount++;
          visitedCursors.add(cursor);
          final nextRes = await apiClient.getClients(
            teamId: (teamId != null && teamId.isNotEmpty) ? teamId : null,
            gnId: (teamId == null || teamId.isEmpty) ? gnId : null,
            search: _searchCtrl.text.trim().isNotEmpty
                ? _searchCtrl.text.trim()
                : null,
            cursor: cursor,
            limit: 100,
          );
          final nextList =
              (nextRes['clients'] as List? ?? nextRes['data'] as List? ?? [])
                  .whereType<Map<String, dynamic>>()
                  .toList();
          clientList.addAll(nextList);
          cursor = nextRes['nextCursor'] as String?;
        }

        // Merge local unsynced records (drafts, pending, rejected) so they remain visible online
        List<Map<String, dynamic>> localClients = [];
        try {
          final db = await ref.read(databaseProvider.future);
          localClients = await db.getAllClientsWithHouseInfo();
        } catch (_) {}

        final serverIds = clientList.map((c) => c['id']?.toString()).toSet();
        final localUnsynced = localClients.where((c) {
          final status = c['sync_status']?.toString();
          final id = c['id']?.toString();
          final isUnsynced =
              status == 'draft' || status == 'pending' || status == 'rejected';
          return isUnsynced || (id != null && !serverIds.contains(id));
        }).map((c) {
          return {
            'id': c['id'],
            'householdId': c['household_id'],
            'houseNo': c['house_no'],
            'houseLeaderName': c['house_leader_name'],
            'name': c['name'],
            'age': c['age'],
            'gender': c['gender'],
            'address': c['address'],
            'phoneRaw': c['phone_raw'],
            'phoneE164': c['phone_e164'],
            'highestEducation': c['highest_education'],
            'highestVocational': c['highest_vocational'],
            'isSamurdhi': c['is_samurdhi'] == 1,
            'isAswesuma': c['is_aswesuma'] == 1,
            'hasSpecialNeeds': c['has_special_needs'] == 1,
            'isEpf': c['is_epf'] == 1,
            'isEtf': c['is_etf'] == 1,
            'syncStatus': c['sync_status'],
            'lastErrorCode': c['last_error_code'],
          };
        }).toList();

        final mergedRecords = [...localUnsynced, ...clientList];

        if (mounted) {
          setState(() {
            _records = mergedRecords;
            _isLoading = false;
          });
        }
        return;
      } catch (e) {
        // Fall back to local DB if remote request failed, notifying user
        serverWarning = 'Server unreachable: showing cached device records.';
      }
    }

    // Load from local DB
    try {
      final db = await ref.read(databaseProvider.future);
      final localClients = await db.getAllClientsWithHouseInfo();

      final mapped = localClients.map((c) {
        return {
          'id': c['id'],
          'householdId': c['household_id'],
          'houseNo': c['house_no'],
          'houseLeaderName': c['house_leader_name'],
          'name': c['name'],
          'age': c['age'],
          'gender': c['gender'],
          'address': c['address'],
          'phoneRaw': c['phone_raw'],
          'phoneE164': c['phone_e164'],
          'highestEducation': c['highest_education'],
          'highestVocational': c['highest_vocational'],
          'isSamurdhi': c['is_samurdhi'] == 1,
          'isAswesuma': c['is_aswesuma'] == 1,
          'hasSpecialNeeds': c['has_special_needs'] == 1,
          'isEpf': c['is_epf'] == 1,
          'isEtf': c['is_etf'] == 1,
          'syncStatus': c['sync_status'],
          'lastErrorCode': c['last_error_code'],
        };
      }).toList();

      if (mounted) {
        setState(() {
          _records = mapped;
          _isLoading = false;
          _errorMessage = serverWarning;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load records: ${e.toString()}';
        });
      }
    }
  }

  List<Map<String, dynamic>> get _filteredRecords {
    final query = _searchCtrl.text.trim().toLowerCase();
    return _records.where((r) {
      final name = (r['name'] ?? '').toString().toLowerCase();
      final phone = (r['phoneRaw'] ?? r['phoneE164'] ?? '').toString();
      final houseId = (r['householdId'] ?? '').toString().toLowerCase();
      final houseNo = (r['household'] is Map
              ? r['household']['houseNo']
              : r['houseNo'] ?? '')
          .toString()
          .toLowerCase();
      final houseLeader = (r['household'] is Map
              ? r['household']['houseLeaderName']
              : r['houseLeaderName'] ?? '')
          .toString()
          .toLowerCase();

      final matchesSearch = query.isEmpty ||
          name.contains(query) ||
          phone.contains(query) ||
          houseNo.contains(query) ||
          houseLeader.contains(query) ||
          houseId.contains(query);

      if (!matchesSearch) return false;

      switch (_selectedFilter) {
        case 'special_needs':
          return r['hasSpecialNeeds'] == true || r['hasSpecialNeeds'] == 1;
        case 'samurdhi':
          return r['isSamurdhi'] == true || r['isSamurdhi'] == 1;
        case 'aswesuma':
          return r['isAswesuma'] == true || r['isAswesuma'] == 1;
        case 'all':
        default:
          return true;
      }
    }).toList();
  }

  Future<void> _showRecordDetails(Map<String, dynamic> record) async {
    final shouldEdit = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetCtx) {
        final isOnline = ref.read(connectivityProvider);
        final name = record['name'] ?? 'Unnamed';
        final age = record['age'] ?? '—';
        final gender = record['gender'] ?? '—';
        final phone = record['phoneRaw'] ?? record['phoneE164'] ?? 'None';
        final address = record['address'] ?? '—';
        final education = record['highestEducation'] ?? 'None';
        final specialNeeds =
            record['hasSpecialNeeds'] == true || record['hasSpecialNeeds'] == 1;
        final samurdhi =
            record['isSamurdhi'] == true || record['isSamurdhi'] == 1;
        final aswesuma =
            record['isAswesuma'] == true || record['isAswesuma'] == 1;
        final lastError = record['lastErrorCode'];

        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (ctx, scrollCtrl) {
            final l10n = GrsL10n.of(ctx);
            return SingleChildScrollView(
              controller: scrollCtrl,
              padding: const EdgeInsets.all(GrsSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: GrsSpacing.md),
                      decoration: BoxDecoration(
                        color: GrsColors.outlineLight,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Header with name & avatar
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: GrsColors.primaryLight.withValues(
                          alpha: 0.15,
                        ),
                        child: Text(
                          name.isNotEmpty ? name[0].toUpperCase() : 'B',
                          style: const TextStyle(
                            fontSize: 22,
                            color: GrsColors.primaryLight,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: GrsSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              '$age yrs  •  $gender',
                              style: const TextStyle(
                                fontSize: 13,
                                color: GrsColors.textSecondaryLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  if (lastError != null && lastError.isNotEmpty) ...[
                    const SizedBox(height: GrsSpacing.md),
                    Container(
                      padding: const EdgeInsets.all(GrsSpacing.sm),
                      decoration: BoxDecoration(
                        color: GrsColors.syncRejectedBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: GrsColors.syncRejected,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              lastError == 'HOUSE_DELETED'
                                  ? 'Household associated with this client was removed by Level 4. Client is retained per Decision C6.'
                                  : 'Notice: $lastError',
                              style: const TextStyle(
                                fontSize: 12,
                                color: GrsColors.syncRejected,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const Divider(height: GrsSpacing.xl),

                  _buildDetailRow(
                    'Household ID',
                    '${record['householdId'] ?? '—'}',
                  ),
                  _buildDetailRow('Phone', '$phone'),
                  _buildDetailRow('Address', '$address'),
                  _buildDetailRow('Highest Education', '$education'),

                  const SizedBox(height: GrsSpacing.md),
                  const Text(
                    'Welfare & Special Status',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: GrsSpacing.xs),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      if (specialNeeds)
                        _buildStatusBadge(
                          'Special Needs',
                          GrsColors.syncPending,
                        ),
                      if (samurdhi)
                        _buildStatusBadge('Samurdhi', GrsColors.primaryMid),
                      if (aswesuma)
                        _buildStatusBadge('Aswesuma', GrsColors.syncSynced),
                      if (!specialNeeds && !samurdhi && !aswesuma)
                        Text(l10n.get('noWelfareFlags')),
                    ],
                  ),

                  const SizedBox(height: GrsSpacing.xl),

                  // Decision C2/C13: Level 4 correction button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: GrsColors.primaryMid,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: const Icon(Icons.edit_note, size: 22),
                      label: const Text(
                        'Correct Client Record (Decision C2)',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      onPressed: isOnline
                          ? () => Navigator.of(sheetCtx).pop(true)
                          : () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Online connection required to submit official supervisor corrections.',
                                  ),
                                  backgroundColor: GrsColors.syncPending,
                                ),
                              );
                            },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    if (shouldEdit == true && mounted) {
      final updatedPayload = await _showCorrectionDialog(record);
      if (updatedPayload != null && mounted) {
        try {
          final apiClient = ref.read(apiClientProvider);
          final clientId = record['id'] as String;

          await apiClient.updateClient(clientId, updatedPayload);

          try {
            final db = await ref.read(databaseProvider.future);
            await db.updateClientFields(
              clientId,
              name: updatedPayload['name'] as String?,
              age: updatedPayload['age'] as int?,
              gender: updatedPayload['gender'] as String?,
              address: (updatedPayload['address'] as String?)?.isEmpty == true
                  ? null
                  : updatedPayload['address'] as String?,
              phoneRaw: (updatedPayload['phoneRaw'] as String?)?.isEmpty == true
                  ? null
                  : updatedPayload['phoneRaw'] as String?,
              hasSpecialNeeds: updatedPayload['hasSpecialNeeds'] as bool?,
              isSamurdhi: updatedPayload['isSamurdhi'] as bool?,
              isAswesuma: updatedPayload['isAswesuma'] as bool?,
            );
          } catch (_) {}

          if (mounted) {
            final l10n = GrsL10n.of(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(l10n.get('clientRecordUpdatedSuccess')),
                backgroundColor: GrsColors.syncSynced,
              ),
            );
            _fetchRecords();
          }
        } catch (e) {
          if (mounted) {
            final l10n = GrsL10n.of(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  l10n.translate('failedWithError', {'error': e.toString()}),
                ),
                backgroundColor: GrsColors.syncRejected,
              ),
            );
          }
        }
      }
    }
  }

  /// Decision C2 / C13: Correction of client record by Level 4.
  /// Requires mandatory audit trail reason (persisted in client_audit).
  Future<Map<String, dynamic>?> _showCorrectionDialog(
    Map<String, dynamic> record,
  ) {
    return showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => _CorrectionDialog(record: record),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: GrsSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: GrsColors.textSecondaryLight,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final isOnline = ref.watch(connectivityProvider);
    final filtered = _filteredRecords;

    return GrsScaffold(
      title: l10n.get('teamRecords'),
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage: l10n.get('onlineOnlyNotice'),
      body: Column(
        children: [
          // Search and Filters
          Padding(
            padding: const EdgeInsets.all(GrsSpacing.md),
            child: Column(
              children: [
                GrsTextField(
                  controller: _searchCtrl,
                  label: l10n.get('searchRecordsHint'),
                  hint: l10n.get('searchRecordsHint'),
                  prefixIcon: const Icon(Icons.search),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: GrsSpacing.sm),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip(
                        'all',
                        '${l10n.get('allTab')} (${_records.length})',
                      ),
                      const SizedBox(width: GrsSpacing.xs),
                      _buildFilterChip(
                        'special_needs',
                        l10n.get('specialNeeds'),
                      ),
                      const SizedBox(width: GrsSpacing.xs),
                      _buildFilterChip('samurdhi', l10n.get('samurdhi')),
                      const SizedBox(width: GrsSpacing.xs),
                      _buildFilterChip('aswesuma', l10n.get('aswesuma')),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (_errorMessage != null && _records.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: GrsSpacing.md,
                vertical: GrsSpacing.xs,
              ),
              color: Colors.amber.shade100,
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.amber.shade900),
                  const SizedBox(width: GrsSpacing.xs),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: TextStyle(fontSize: 12, color: Colors.amber.shade900),
                    ),
                  ),
                ],
              ),
            ),

          // Records List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null && _records.isEmpty
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
                            onPressed: _fetchRecords,
                            child: Text(l10n.get('retry')),
                          ),
                        ],
                      ),
                    ),
                  )
                : filtered.isEmpty
                ? Center(
                    child: Text(
                      l10n.get('noRecordsFound'),
                      style: const TextStyle(
                        fontSize: 14,
                        color: GrsColors.textSecondaryLight,
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _fetchRecords,
                    child: ListView.separated(
                      padding: const EdgeInsets.symmetric(
                        horizontal: GrsSpacing.md,
                        vertical: GrsSpacing.xs,
                      ),
                      itemCount: filtered.length,
                      separatorBuilder: (ctx, idx) =>
                          const SizedBox(height: GrsSpacing.xs),
                      itemBuilder: (ctx, idx) {
                        final record = filtered[idx];
                        final name = record['name'] ?? 'Unnamed';
                        final age = record['age'] ?? '—';
                        final gender = record['gender'] ?? '—';
                        final phone =
                            record['phoneRaw'] ?? record['phoneE164'] ?? '';
                        final specialNeeds =
                            record['hasSpecialNeeds'] == true ||
                            record['hasSpecialNeeds'] == 1;
                        final samurdhi =
                            record['isSamurdhi'] == true ||
                            record['isSamurdhi'] == 1;
                        final aswesuma =
                            record['isAswesuma'] == true ||
                            record['isAswesuma'] == 1;

                        final houseNo = (record['household'] is Map
                                ? record['household']['houseNo']
                                : record['houseNo'] ?? '')
                            .toString();

                        return GrsCard(
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: GrsSpacing.sm,
                              vertical: 2,
                            ),
                            leading: CircleAvatar(
                              backgroundColor: GrsColors.primaryLight
                                  .withValues(alpha: 0.15),
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : 'C',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: GrsColors.primaryLight,
                                ),
                              ),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    name,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                if (specialNeeds)
                                  const Padding(
                                    padding: EdgeInsets.only(left: 4),
                                    child: Icon(
                                      Icons.accessible,
                                      size: 16,
                                      color: GrsColors.syncPending,
                                    ),
                                  ),
                                if (samurdhi || aswesuma)
                                  const Padding(
                                    padding: EdgeInsets.only(left: 4),
                                    child: Icon(
                                      Icons.verified,
                                      size: 16,
                                      color: GrsColors.syncSynced,
                                    ),
                                  ),
                              ],
                            ),
                            subtitle: Text(
                              '$age yrs • $gender ${phone.isNotEmpty ? '• $phone' : ''}${houseNo.isNotEmpty ? ' • House #$houseNo' : ''}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: GrsColors.textSecondaryLight,
                              ),
                            ),
                            trailing: const Icon(
                              Icons.chevron_right,
                              color: GrsColors.textSecondaryLight,
                            ),
                            onTap: () => _showRecordDetails(record),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _selectedFilter == value;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => setState(() => _selectedFilter = value),
      selectedColor: GrsColors.primaryMid.withValues(alpha: 0.15),
      labelStyle: TextStyle(
        color: isSelected
            ? GrsColors.primaryLight
            : GrsColors.textSecondaryLight,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }
}

class _CorrectionDialog extends StatefulWidget {
  final Map<String, dynamic> record;

  const _CorrectionDialog({required this.record});

  @override
  State<_CorrectionDialog> createState() => _CorrectionDialogState();
}

class _CorrectionDialogState extends State<_CorrectionDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _ageCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _reasonCtrl;

  late String _selectedGender;
  late bool _specialNeeds;
  late bool _samurdhi;
  late bool _aswesuma;

  @override
  void initState() {
    super.initState();
    final r = widget.record;
    _nameCtrl = TextEditingController(text: r['name'] ?? '');
    _ageCtrl = TextEditingController(text: '${r['age'] ?? ''}');
    _phoneCtrl = TextEditingController(
      text: r['phoneRaw'] ?? r['phoneE164'] ?? '',
    );
    _addressCtrl = TextEditingController(text: r['address'] ?? '');
    _reasonCtrl = TextEditingController();

    final rawGender = (r['gender'] ?? 'M').toString().toUpperCase();
    _selectedGender = (rawGender == 'F' || rawGender == 'FEMALE') ? 'F' : 'M';

    _specialNeeds = r['hasSpecialNeeds'] == true || r['hasSpecialNeeds'] == 1;
    _samurdhi = r['isSamurdhi'] == true || r['isSamurdhi'] == 1;
    _aswesuma = r['isAswesuma'] == true || r['isAswesuma'] == 1;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _ageCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    return AlertDialog(
      title: Text(l10n.get('supervisorCorrection')),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GrsTextField(
                  controller: _nameCtrl,
                  label: '${l10n.get('fullName')} *',
                  prefixIcon: const Icon(Icons.person_outline),
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return 'Name is required';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: GrsSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: GrsTextField(
                        controller: _ageCtrl,
                        label: 'Age (0-120) *',
                        prefixIcon: const Icon(Icons.calendar_today_outlined),
                        keyboardType: TextInputType.number,
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) {
                            return 'Age required';
                          }
                          final n = int.tryParse(val.trim());
                          if (n == null || n < 0 || n > 120) {
                            return 'Invalid age';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: GrsSpacing.md),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _selectedGender,
                        decoration: InputDecoration(
                          labelText: l10n.get('gender') == 'gender'
                              ? 'Gender'
                              : l10n.get('gender'),
                          border: const OutlineInputBorder(),
                        ),
                        items: [
                          DropdownMenuItem(
                            value: 'M',
                            child: Text(l10n.get('male')),
                          ),
                          DropdownMenuItem(
                            value: 'F',
                            child: Text(l10n.get('female')),
                          ),
                        ],
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _selectedGender = val);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _phoneCtrl,
                  label: l10n.get('phoneNumber'),
                  prefixIcon: const Icon(Icons.phone_outlined),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _addressCtrl,
                  label: l10n.get('address'),
                  prefixIcon: const Icon(Icons.home_outlined),
                ),
                const SizedBox(height: GrsSpacing.md),
                Text(
                  l10n.get('vulnerabilityFlags'),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                CheckboxListTile(
                  dense: true,
                  title: Text(l10n.get('specialNeeds')),
                  value: _specialNeeds,
                  onChanged: (val) =>
                      setState(() => _specialNeeds = val ?? false),
                ),
                CheckboxListTile(
                  dense: true,
                  title: Text(l10n.get('samurdhiBeneficiary')),
                  value: _samurdhi,
                  onChanged: (val) => setState(() => _samurdhi = val ?? false),
                ),
                CheckboxListTile(
                  dense: true,
                  title: Text(l10n.get('aswesumaBeneficiary')),
                  value: _aswesuma,
                  onChanged: (val) => setState(() => _aswesuma = val ?? false),
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _reasonCtrl,
                  label: '${l10n.get('correctionReason')} *',
                  hint: l10n.get('correctionReasonHint'),
                  prefixIcon: const Icon(Icons.rate_review_outlined),
                  maxLines: 2,
                  validator: (val) {
                    if (val == null || val.trim().length < 5) {
                      return 'Please provide a valid correction reason (min 5 chars)';
                    }
                    return null;
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: Text(l10n.get('cancel')),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: GrsColors.primaryMid,
            foregroundColor: Colors.white,
          ),
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            final payload = <String, dynamic>{
              'name': _nameCtrl.text.trim(),
              'age': int.parse(_ageCtrl.text.trim()),
              'gender': _selectedGender,
              'address': _addressCtrl.text.trim(),
              'phoneRaw': _phoneCtrl.text.trim(),
              'hasSpecialNeeds': _specialNeeds,
              'isSamurdhi': _samurdhi,
              'isAswesuma': _aswesuma,
              'correctionReason': _reasonCtrl.text.trim(),
            };
            Navigator.of(context).pop(payload);
          },
          child: Text(l10n.get('saveCorrection')),
        ),
      ],
    );
  }
}
