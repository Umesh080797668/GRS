import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/duplicates_provider.dart';

/// Level 4 (CDC Secretary) duplicate review queue screen (M6.4).
///
/// Online action (with offline guard banner): lists flagged duplicate pairs in
/// the team/area, allows choosing which record to keep canonical, and lets
/// the supervisor Confirm Duplicate (`duplicate_of` soft link) or Dismiss.
class TeamDuplicatesScreen extends ConsumerStatefulWidget {
  const TeamDuplicatesScreen({super.key});

  @override
  ConsumerState<TeamDuplicatesScreen> createState() =>
      _TeamDuplicatesScreenState();
}

class _TeamDuplicatesScreenState extends ConsumerState<TeamDuplicatesScreen> {
  String _status = 'open';
  bool _isLoading = true;
  bool _isLoadingMore = false;
  String? _errorMessage;
  String? _actingId;
  String? _nextCursor;
  List<Map<String, dynamic>> _items = [];
  final Map<String, String> _selectedCanonical = {};

  @override
  void initState() {
    super.initState();
    _loadQueue();
  }

  Future<void> _loadQueue({String? cursor, bool append = false}) async {
    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
          _errorMessage = null;
          if (!append) _items = [];
        });
      }
      return;
    }

    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _errorMessage = null;
      }
    });

    try {
      final apiClient = ref.read(apiClientProvider);
      final res = await apiClient.getDuplicates(
        status: _status,
        cursor: cursor,
        limit: 20,
      );

      final rawItems = (res['items'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();

      if (!mounted) return;
      setState(() {
        if (append) {
          _items = [..._items, ...rawItems];
        } else {
          _items = rawItems;
        }
        _nextCursor = res['nextCursor'] as String?;
        _isLoading = false;
        _isLoadingMore = false;

        for (final item in rawItems) {
          final id = item['id']?.toString();
          if (id == null || _selectedCanonical.containsKey(id)) continue;
          final recordA = item['clientARecord'] as Map<String, dynamic>?;
          final recordB = item['clientBRecord'] as Map<String, dynamic>?;
          final aCreated = recordA?['createdAt']?.toString();
          final bCreated = recordB?['createdAt']?.toString();
          if (aCreated != null &&
              bCreated != null &&
              bCreated.compareTo(aCreated) < 0) {
            _selectedCanonical[id] = item['clientB'].toString();
          } else {
            _selectedCanonical[id] = item['clientA'].toString();
          }
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _isLoadingMore = false;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _confirmPair(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    if (id == null || _actingId != null) return;
    final l10n = GrsL10n.of(context);
    final canonicalId =
        _selectedCanonical[id] ?? item['clientA']?.toString() ?? '';

    setState(() => _actingId = id);
    try {
      await ref
          .read(apiClientProvider)
          .confirmDuplicate(id, canonicalClientId: canonicalId);
      ref.read(duplicatesRevisionProvider.notifier).increment();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.get('duplicateConfirmedSuccess'))),
      );
      await _loadQueue();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.translate('failedWithError', {'error': e.toString()}),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _actingId = null);
    }
  }

  Future<void> _dismissPair(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    if (id == null || _actingId != null) return;
    final l10n = GrsL10n.of(context);

    setState(() => _actingId = id);
    try {
      await ref.read(apiClientProvider).dismissDuplicate(id);
      ref.read(duplicatesRevisionProvider.notifier).increment();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.get('duplicateDismissedSuccess'))),
      );
      await _loadQueue();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.translate('failedWithError', {'error': e.toString()}),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _actingId = null);
    }
  }

  Widget _buildStatusChip(String value, String label) {
    final selected = _status == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) {
        if (_status != value) {
          setState(() => _status = value);
          _loadQueue();
        }
      },
      selectedColor: GrsColors.primaryMid.withValues(alpha: 0.15),
      labelStyle: TextStyle(
        color: selected ? GrsColors.primaryLight : GrsColors.textSecondaryLight,
        fontWeight: selected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }

  Widget _buildClientBox({
    required String pairId,
    required Map<String, dynamic>? record,
    required String fallbackId,
    required String slotLabel,
    required bool isOpen,
    required GrsL10n l10n,
  }) {
    final id = (record?['id'] ?? fallbackId).toString();
    final selectedId = _selectedCanonical[pairId];
    final isCanonical = selectedId == id;
    final name = (record?['name'] ?? id).toString();
    final age = record?['age']?.toString() ?? '—';
    final gender = record?['gender']?.toString() ?? '—';
    final phone = (record?['phoneE164'] ?? record?['phoneRaw'] ?? '—')
        .toString();
    final houseNo = record?['houseNo']?.toString();

    return InkWell(
      onTap: isOpen
          ? () => setState(() => _selectedCanonical[pairId] = id)
          : null,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(GrsSpacing.sm),
        decoration: BoxDecoration(
          color: isCanonical
              ? GrsColors.syncSynced.withValues(alpha: 0.07)
              : GrsColors.duplicateAlertBg.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isCanonical
                ? GrsColors.syncSynced
                : (isOpen ? GrsColors.duplicateAlert : GrsColors.outlineLight),
            width: isCanonical ? 1.8 : 1.0,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  slotLabel,
                  style: GrsTypography.labelMedium(
                    color: GrsColors.textSecondaryLight,
                  ).copyWith(fontWeight: FontWeight.w700),
                ),
                if (isOpen && isCanonical)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: GrsColors.syncSynced.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      l10n.get('keepRecordLabel'),
                      style: GrsTypography.labelSmall(
                        color: GrsColors.syncSynced,
                      ).copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              name,
              style: GrsTypography.titleMedium(
                color: GrsColors.textPrimaryLight,
              ).copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              '$age yrs • $gender • $phone${houseNo != null ? ' • #$houseNo' : ''}',
              style: GrsTypography.bodyMedium(
                color: GrsColors.textSecondaryLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final isOnline = ref.watch(connectivityProvider);

    return GrsScaffold(
      title: l10n.get('duplicatesQueueTitle'),
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage: l10n.get('duplicatesOfflineBanner'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: GrsSpacing.md,
              vertical: GrsSpacing.sm,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildStatusChip('open', l10n.get('statusOpenLabel')),
                  const SizedBox(width: GrsSpacing.xs),
                  _buildStatusChip(
                    'confirmed',
                    l10n.get('statusConfirmedLabel'),
                  ),
                  const SizedBox(width: GrsSpacing.xs),
                  _buildStatusChip(
                    'dismissed',
                    l10n.get('statusDismissedLabel'),
                  ),
                ],
              ),
            ),
          ),
          if (!isOnline)
            Padding(
              padding: const EdgeInsets.all(GrsSpacing.md),
              child: Container(
                padding: const EdgeInsets.all(GrsSpacing.md),
                decoration: BoxDecoration(
                  color: GrsColors.duplicateAlertBg,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: GrsColors.duplicateAlert),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.wifi_off_rounded,
                      color: GrsColors.duplicateAlert,
                    ),
                    const SizedBox(width: GrsSpacing.sm),
                    Expanded(
                      child: Text(
                        l10n.get('duplicatesOfflineBanner'),
                        style: GrsTypography.bodyMedium(
                          color: GrsColors.textPrimaryLight,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: !isOnline
                ? Center(
                    child: Text(
                      l10n.get('duplicatesOfflineBanner'),
                      textAlign: TextAlign.center,
                      style: GrsTypography.bodyMedium(
                        color: GrsColors.textSecondaryLight,
                      ),
                    ),
                  )
                : _isLoading
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
                            size: 40,
                            color: GrsColors.syncRejected,
                          ),
                          const SizedBox(height: GrsSpacing.sm),
                          Text(_errorMessage!, textAlign: TextAlign.center),
                          const SizedBox(height: GrsSpacing.md),
                          ElevatedButton(
                            onPressed: _loadQueue,
                            child: Text(l10n.get('retry')),
                          ),
                        ],
                      ),
                    ),
                  )
                : _items.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(GrsSpacing.lg),
                      child: Text(
                        l10n.get('duplicatesEmptyState'),
                        textAlign: TextAlign.center,
                        style: GrsTypography.bodyMedium(
                          color: GrsColors.textSecondaryLight,
                        ),
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _loadQueue,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(GrsSpacing.md),
                      itemCount: _items.length + (_nextCursor != null ? 1 : 0),
                      separatorBuilder: (_, _) =>
                          const SizedBox(height: GrsSpacing.md),
                      itemBuilder: (ctx, idx) {
                        if (idx >= _items.length) {
                          return Center(
                            child: OutlinedButton(
                              onPressed: _isLoadingMore
                                  ? null
                                  : () => _loadQueue(
                                      cursor: _nextCursor,
                                      append: true,
                                    ),
                              child: _isLoadingMore
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(l10n.get('loadMore')),
                            ),
                          );
                        }

                        final item = _items[idx];
                        final pairId = item['id'].toString();
                        final score = item['score']?.toString() ?? '0';
                        final classification =
                            (item['classification'] ?? 'possible').toString();
                        final isProbable = classification == 'probable';
                        final isOpen = item['status'] == 'open';
                        final reasons =
                            item['reasons'] as Map<String, dynamic>?;
                        final factors = (reasons?['factors'] as List? ?? [])
                            .map((e) => e.toString())
                            .toList();
                        final isActing = _actingId == pairId;

                        return GrsCard(
                          child: Padding(
                            padding: const EdgeInsets.all(GrsSpacing.sm),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 6,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 3,
                                      ),
                                      decoration: BoxDecoration(
                                        color: isProbable
                                            ? GrsColors.syncRejectedBg
                                            : GrsColors.duplicateAlertBg,
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Text(
                                        '${l10n.get(isProbable ? 'duplicateProbableLabel' : 'duplicatePossibleLabel')} • ${l10n.translate('duplicateScoreBadge', {'score': score})}',
                                        style: GrsTypography.labelMedium(
                                          color: isProbable
                                              ? GrsColors.syncRejected
                                              : GrsColors.duplicateAlert,
                                        ).copyWith(fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                    for (final f in factors)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 7,
                                          vertical: 3,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.grey.shade100,
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                        ),
                                        child: Text(
                                          f.replaceAll('_', ' '),
                                          style: GrsTypography.labelSmall(
                                            color: GrsColors.textSecondaryLight,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: GrsSpacing.sm),
                                _buildClientBox(
                                  pairId: pairId,
                                  record:
                                      item['clientARecord']
                                          as Map<String, dynamic>?,
                                  fallbackId: item['clientA'].toString(),
                                  slotLabel: 'Record A',
                                  isOpen: isOpen,
                                  l10n: l10n,
                                ),
                                const SizedBox(height: GrsSpacing.xs),
                                _buildClientBox(
                                  pairId: pairId,
                                  record:
                                      item['clientBRecord']
                                          as Map<String, dynamic>?,
                                  fallbackId: item['clientB'].toString(),
                                  slotLabel: 'Record B',
                                  isOpen: isOpen,
                                  l10n: l10n,
                                ),
                                if (isOpen) ...[
                                  const SizedBox(height: GrsSpacing.sm),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: [
                                      OutlinedButton(
                                        onPressed: isActing
                                            ? null
                                            : () => _dismissPair(item),
                                        child: Text(
                                          l10n.get('dismissDuplicateAction'),
                                        ),
                                      ),
                                      ElevatedButton(
                                        onPressed: isActing
                                            ? null
                                            : () => _confirmPair(item),
                                        child: isActing
                                            ? const SizedBox(
                                                width: 16,
                                                height: 16,
                                                child:
                                                    CircularProgressIndicator(
                                                      strokeWidth: 2,
                                                    ),
                                              )
                                            : Text(
                                                l10n.get(
                                                  'confirmDuplicateAction',
                                                ),
                                              ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
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
}
