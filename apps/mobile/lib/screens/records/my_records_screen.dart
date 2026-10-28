import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';

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

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('myRecords'))),
      body: dbAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (db) {
          SyncStatus? filterStatus;
          if (_selectedFilter != 'all') {
            filterStatus = SyncStatusX.fromString(_selectedFilter);
          }

          return FutureBuilder<List<Map<String, dynamic>>>(
            future: db.getAllClients(status: filterStatus),
            builder: (context, snapshot) {
              final records = snapshot.data ?? [];

              return Column(
                children: [
                  // Filter bar
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        _buildFilterChip('all', l10n.get('all')),
                        const SizedBox(width: 8),
                        _buildFilterChip('draft', l10n.get('statusDraft')),
                        const SizedBox(width: 8),
                        _buildFilterChip('pending', l10n.get('statusPending')),
                        const SizedBox(width: 8),
                        _buildFilterChip('synced', l10n.get('statusSynced')),
                        const SizedBox(width: 8),
                        _buildFilterChip(
                          'rejected',
                          l10n.get('statusRejected'),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),

                  // Records list
                  Expanded(
                    child: records.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(
                                  Icons.assignment_turned_in_outlined,
                                  size: 64,
                                  color: Colors.grey,
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  'No records found for "$_selectedFilter"',
                                  style: const TextStyle(
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : ListView.separated(
                            itemCount: records.length,
                            separatorBuilder: (_, _) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final r = records[index];
                              final id = r['id'] as String;
                              final houseId = r['household_id'] as String;
                              final name = r['name'] as String;
                              final age = r['age'] as int;
                              final gender = r['gender'] as String;
                              final status = r['sync_status'] as String;
                              final lastError = r['last_error_code'] as String?;

                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor:
                                      GrsColors.primaryContainerLight,
                                  child: Text(gender == 'F' ? '♀' : '♂'),
                                ),
                                title: Text(
                                  name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Age: $age • $gender'),
                                    if (status == 'rejected' &&
                                        lastError != null)
                                      Text(
                                        'Reason: $lastError',
                                        style: const TextStyle(
                                          color: GrsColors.syncRejected,
                                          fontSize: 12,
                                        ),
                                      ),
                                  ],
                                ),
                                trailing: _buildBadge(status, l10n),
                                onTap: () {
                                  if (status == 'rejected') {
                                    _showRejectedDialog(
                                      context,
                                      id,
                                      houseId,
                                      lastError,
                                    );
                                  } else {
                                    context.push('/houses/$houseId/client/$id');
                                  }
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
            Icon(Icons.error_outline, color: GrsColors.syncRejected),
            SizedBox(width: 8),
            Text('Record Rejected'),
          ],
        ),
        content: Text(
          'The server rejected this record during sync:\n\n${reason ?? "Validation failed"}\n\nPlease fix the errors and resubmit.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.push('/houses/$houseId/client/$clientId');
            },
            child: const Text('Fix & Resubmit'),
          ),
        ],
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

  Widget _buildBadge(String status, GrsL10n l10n) {
    switch (status) {
      case 'synced':
        return GrsSyncBadge(
          status: GrsSyncStatus.synced,
          label: l10n.get('statusSynced'),
        );
      case 'pending':
        return GrsSyncBadge(
          status: GrsSyncStatus.pending,
          label: l10n.get('statusPending'),
        );
      case 'rejected':
        return GrsSyncBadge(
          status: GrsSyncStatus.rejected,
          label: l10n.get('statusRejected'),
        );
      case 'draft':
      default:
        return GrsSyncBadge(
          status: GrsSyncStatus.draft,
          label: l10n.get('statusDraft'),
        );
    }
  }
}
