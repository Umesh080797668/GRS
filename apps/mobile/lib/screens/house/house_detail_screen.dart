import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';

class HouseDetailScreen extends ConsumerWidget {
  final String houseId;

  const HouseDetailScreen({super.key, required this.houseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = GrsL10n.of(context);
    final dbAsync = ref.watch(databaseProvider);

    return dbAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text('Error: $err'))),
      data: (db) {
        return FutureBuilder<Map<String, dynamic>?>(
          future: db.getHouseholdById(houseId),
          builder: (context, houseSnapshot) {
            final house = houseSnapshot.data;
            if (house == null) {
              return Scaffold(
                appBar: AppBar(title: Text(l10n.get('houseDetailTitle'))),
                body: const Center(child: Text('Household not found.')),
              );
            }

            final serialNo = house['serial_no'] as int;
            final houseNo = house['house_no'] as String;
            final leader = house['house_leader_name'] as String;
            final village = house['village_name'] as String? ?? 'N/A';
            final address = house['address'] as String? ?? 'N/A';
            final isEpf = (house['is_epf'] as int) == 1;
            final isEtf = (house['is_etf'] as int) == 1;
            final isAswesuma = (house['is_aswesuma'] as int) == 1;
            final isSamurdhi = (house['is_samurdhi'] as int) == 1;
            final hasSpecialNeeds = (house['has_special_needs'] as int) == 1;

            return FutureBuilder<List<Map<String, dynamic>>>(
              future: db.getClientsForHousehold(houseId),
              builder: (context, clientSnapshot) {
                final clients = clientSnapshot.data ?? [];

                return GrsScaffold(
                  title: '${l10n.get('houseNumber')}: $houseNo',
                  subtitle: '${l10n.get('serialNumber')}: $serialNo',
                  showBackButton: true,
                  onBack: () => context.pop(),
                  body: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Pre-visit details card (DD/S/002)
                        GrsCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.get('previsitDataTitle'),
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: GrsColors.primaryLight,
                                ),
                              ),
                              const Divider(height: 20),
                              Text(
                                '${l10n.get('houseLeader')}: $leader',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text('${l10n.get('villageName')}: $village'),
                              const SizedBox(height: 4),
                              Text('${l10n.get('address')}: $address'),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  if (isEpf) _buildChip('EPF'),
                                  if (isEtf) _buildChip('ETF'),
                                  if (isAswesuma) _buildChip('Aswesuma'),
                                  if (isSamurdhi) _buildChip('Samurdhi'),
                                  if (hasSpecialNeeds)
                                    _buildChip('Special Needs', isAlert: true),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Beneficiaries Section Header
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '${l10n.get('beneficiariesCount')} (${clients.length})',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            ElevatedButton.icon(
                              icon: const Icon(Icons.person_add),
                              label: Text(l10n.get('addBeneficiaryButton')),
                              onPressed: () =>
                                  context.push('/houses/$houseId/consent'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Beneficiaries List
                        if (clients.isEmpty)
                          Container(
                            padding: const EdgeInsets.all(24),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'No beneficiaries recorded yet for this house.\nClick "Add Beneficiary" to begin survey.',
                              textAlign: TextAlign.center,
                            ),
                          )
                        else
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: clients.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, idx) {
                              final c = clients[idx];
                              final clientId = c['id'] as String;
                              final name = c['name'] as String;
                              final age = c['age'] as int;
                              final gender = c['gender'] as String;
                              final syncStatus = c['sync_status'] as String;

                              return GrsCard(
                                onTap: () => context.push(
                                  '/houses/$houseId/client/$clientId',
                                ),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      child: Text(gender == 'F' ? '♀' : '♂'),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            name,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 16,
                                            ),
                                          ),
                                          Text('Age: $age • $gender'),
                                        ],
                                      ),
                                    ),
                                    _buildSyncBadge(syncStatus, l10n),
                                  ],
                                ),
                              );
                            },
                          ),

                        const SizedBox(height: 24),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.check_circle_outline),
                          label: Text(l10n.get('finishHouseButton')),
                          onPressed: () async {
                            await db.updateHouseholdStatus(
                              houseId,
                              'completed',
                            );
                            if (context.mounted) {
                              context.pop();
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  Widget _buildChip(String label, {bool isAlert = false}) {
    return Chip(
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: isAlert ? GrsColors.duplicateAlert : GrsColors.primaryLight,
        ),
      ),
      backgroundColor: isAlert
          ? GrsColors.duplicateAlertBg
          : GrsColors.primaryContainerLight,
      padding: EdgeInsets.zero,
    );
  }

  Widget _buildSyncBadge(String status, GrsL10n l10n) {
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
