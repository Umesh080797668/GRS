import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';
import '../../providers/sync_provider.dart';

class HouseDetailScreen extends ConsumerWidget {
  final String houseId;

  const HouseDetailScreen({super.key, required this.houseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = GrsL10n.of(context);
    final dbAsync = ref.watch(databaseProvider);
    final revision = ref.watch(recordsRevisionProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return dbAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text('Error: $err'))),
      data: (db) {
        return FutureBuilder<Map<String, dynamic>?>(
          key: ValueKey('h_${houseId}_$revision'),
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
              key: ValueKey('c_${houseId}_$revision'),
              future: db.getClientsForHousehold(houseId),
              builder: (context, clientSnapshot) {
                final clients = clientSnapshot.data ?? [];

                return Scaffold(
                  appBar: AppBar(
                    title: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${l10n.get('houseNumber')}: $houseNo',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                            color: isDark
                                ? GrsColors.textPrimaryDark
                                : GrsColors.textPrimaryLight,
                          ),
                        ),
                        Text(
                          '${l10n.get('serialNumber')}: $serialNo',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark
                                ? GrsColors.textSecondaryDark
                                : GrsColors.textSecondaryLight,
                          ),
                        ),
                      ],
                    ),
                    leading: IconButton(
                      icon: const Icon(
                        Icons.arrow_back_ios_new_rounded,
                        size: 20,
                      ),
                      onPressed: () => context.pop(),
                    ),
                  ),
                  body: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // ── Household Info Card ────────────────────────────
                        GrsFadeSlideItem(
                          index: 0,
                          child: GrsCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Card header row
                                Row(
                                  children: [
                                    Container(
                                      width: 38,
                                      height: 38,
                                      decoration: BoxDecoration(
                                        color: isDark
                                            ? GrsColors.primaryContainerDark
                                            : GrsColors.primaryContainerLight,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Icon(
                                        Icons.home_outlined,
                                        size: 20,
                                        color: isDark
                                            ? GrsColors.primaryDark
                                            : GrsColors.primaryLight,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        l10n.get('previsitDataTitle'),
                                        style: GrsTypography.titleMedium(
                                          color: isDark
                                              ? GrsColors.textPrimaryDark
                                              : GrsColors.textPrimaryLight,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),

                                const SizedBox(height: 16),

                                // Info rows
                                _InfoRow(
                                  label: l10n.get('houseLeader'),
                                  value: leader,
                                  isDark: isDark,
                                  bold: true,
                                ),
                                const SizedBox(height: 8),
                                _InfoRow(
                                  label: l10n.get('villageName'),
                                  value: village,
                                  isDark: isDark,
                                ),
                                const SizedBox(height: 8),
                                _InfoRow(
                                  label: l10n.get('address'),
                                  value: address,
                                  isDark: isDark,
                                ),

                                // Tags
                                if (isEpf ||
                                    isEtf ||
                                    isAswesuma ||
                                    isSamurdhi ||
                                    hasSpecialNeeds) ...[
                                  const SizedBox(height: 14),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: [
                                      if (isEpf) _buildTag('EPF', isDark),
                                      if (isEtf) _buildTag('ETF', isDark),
                                      if (isAswesuma)
                                        _buildTag('Aswesuma', isDark),
                                      if (isSamurdhi)
                                        _buildTag('Samurdhi', isDark),
                                      if (hasSpecialNeeds)
                                        _buildTag(
                                          'Special Needs',
                                          isDark,
                                          isAlert: true,
                                        ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(height: 20),

                        // ── Beneficiaries Header ───────────────────────────
                        GrsFadeSlideItem(
                          index: 1,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Text(
                                '${l10n.get('beneficiariesCount')} (${clients.length})',
                                style: GrsTypography.headlineMedium(
                                  color: isDark
                                      ? GrsColors.textPrimaryDark
                                      : GrsColors.textPrimaryLight,
                                ).copyWith(fontSize: 18),
                              ),
                              GrsBounceTouch(
                                onTap: () async {
                                  await context.push(
                                    '/houses/$houseId/consent',
                                  );
                                  ref
                                      .read(recordsRevisionProvider.notifier)
                                      .increment();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 9,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isDark
                                        ? GrsColors.primaryContainerDark
                                        : GrsColors.primaryContainerLight,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.person_add_rounded,
                                        size: 16,
                                        color: isDark
                                            ? GrsColors.primaryDark
                                            : GrsColors.primaryLight,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        l10n.get('addBeneficiaryButton'),
                                        style: GrsTypography.labelMedium(
                                          color: isDark
                                              ? GrsColors.primaryDark
                                              : GrsColors.primaryLight,
                                        ).copyWith(fontWeight: FontWeight.w700),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 12),

                        // ── Beneficiaries List ─────────────────────────────
                        if (clients.isEmpty)
                          GrsFadeSlideItem(
                            index: 2,
                            child: _EmptyBeneficiaries(isDark: isDark),
                          )
                        else
                          ...List.generate(clients.length, (idx) {
                            final c = clients[idx];
                            return GrsFadeSlideItem(
                              index: idx + 2,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _BeneficiaryCard(
                                  client: c,
                                  houseId: houseId,
                                  l10n: l10n,
                                  isDark: isDark,
                                ),
                              ),
                            );
                          }),

                        const SizedBox(height: 24),

                        // ── Finish house ───────────────────────────────────
                        GrsFadeSlideItem(
                          index: clients.length + 2,
                          child: GrsButton(
                            label: l10n.get('finishHouseButton'),
                            icon: Icons.check_circle_outline_rounded,
                            variant: GrsButtonVariant.outline,
                            isFullWidth: true,
                            onPressed: () async {
                              await db.updateHouseholdStatus(
                                houseId,
                                'completed',
                              );
                              if (context.mounted) context.pop();
                            },
                          ),
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

  Widget _buildTag(String label, bool isDark, {bool isAlert = false}) {
    final tagColor = isAlert
        ? GrsColors.duplicateAlert
        : (isDark ? GrsColors.primaryDark : GrsColors.primaryLight);
    final tagBg = isAlert
        ? (isDark ? GrsColors.syncPendingBgDark : GrsColors.duplicateAlertBg)
        : (isDark
              ? GrsColors.primaryContainerDark
              : GrsColors.primaryContainerLight);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: tagBg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: GrsTypography.labelSmall(
          color: tagColor,
        ).copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ────────────────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    required this.isDark,
    this.bold = false,
  });

  final String label;
  final String value;
  final bool isDark;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final secondaryColor = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final inkColor = isDark
        ? GrsColors.textPrimaryDark
        : GrsColors.textPrimaryLight;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: GrsTypography.bodyMedium(color: secondaryColor),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GrsTypography.bodyMedium(
              color: inkColor,
            ).copyWith(fontWeight: bold ? FontWeight.w600 : FontWeight.w400),
          ),
        ),
      ],
    );
  }
}

class _EmptyBeneficiaries extends StatelessWidget {
  const _EmptyBeneficiaries({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: isDark
            ? GrsColors.surfaceVariantDark
            : GrsColors.surfaceVariantLight,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Icon(
            Icons.people_outline_rounded,
            size: 48,
            color: isDark
                ? GrsColors.textTertiaryDark
                : GrsColors.textTertiaryLight,
          ),
          const SizedBox(height: 12),
          Text(
            'No beneficiaries recorded yet.',
            style: GrsTypography.bodyMedium(
              color: isDark
                  ? GrsColors.textSecondaryDark
                  : GrsColors.textSecondaryLight,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _BeneficiaryCard extends StatelessWidget {
  const _BeneficiaryCard({
    required this.client,
    required this.houseId,
    required this.l10n,
    required this.isDark,
  });

  final Map<String, dynamic> client;
  final String houseId;
  final GrsL10n l10n;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final clientId = client['id'] as String;
    final name = client['name'] as String;
    final age = client['age'] as int;
    final gender = client['gender'] as String;
    final syncStatus = client['sync_status'] as String;

    final isFemale = gender == 'F';
    final avatarBg = isFemale
        ? (isDark ? const Color(0xFF2D1B45) : const Color(0xFFF3E8FF))
        : (isDark
              ? GrsColors.primaryContainerDark
              : GrsColors.primaryContainerLight);
    final avatarInk = isFemale
        ? const Color(0xFF9333EA)
        : (isDark ? GrsColors.primaryDark : GrsColors.primaryLight);

    return GrsCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: () async {
        await context.push('/houses/$houseId/client/$clientId');
      },
      child: Row(
        children: [
          // Gender avatar
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: avatarBg,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text(
              isFemale ? '♀' : '♂',
              style: TextStyle(fontSize: 20, color: avatarInk),
            ),
          ),
          const SizedBox(width: 14),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GrsTypography.titleMedium(
                    color: isDark
                        ? GrsColors.textPrimaryDark
                        : GrsColors.textPrimaryLight,
                  ).copyWith(fontSize: 15),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  'Age $age · ${isFemale ? 'Female' : 'Male'}',
                  style: GrsTypography.bodyMedium(
                    color: isDark
                        ? GrsColors.textSecondaryDark
                        : GrsColors.textSecondaryLight,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),

          // Sync badge
          _buildSyncBadge(syncStatus, l10n),
        ],
      ),
    );
  }

  Widget _buildSyncBadge(String status, GrsL10n l10n) {
    return switch (status) {
      'synced' => GrsSyncBadge(
        status: GrsSyncStatus.synced,
        label: l10n.get('statusSynced'),
      ),
      'pending' => GrsSyncBadge(
        status: GrsSyncStatus.pending,
        label: l10n.get('statusPending'),
      ),
      'rejected' => GrsSyncBadge(
        status: GrsSyncStatus.rejected,
        label: l10n.get('statusRejected'),
      ),
      _ => GrsSyncBadge(
        status: GrsSyncStatus.draft,
        label: l10n.get('statusDraft'),
      ),
    };
  }
}
