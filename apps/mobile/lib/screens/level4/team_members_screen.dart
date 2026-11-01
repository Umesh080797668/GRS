import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import 'package:share_plus/share_plus.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../services/security_service.dart';

/// Screen for Level 4 (CDC Secretary) to manage team members (M4.3).
///
/// Supports listing members, displaying team capacity, creating single or bulk
/// members, displaying a one-time ephemeral credential screen with copy/share,
/// and deactivating members.
class TeamMembersScreen extends ConsumerStatefulWidget {
  const TeamMembersScreen({super.key});

  @override
  ConsumerState<TeamMembersScreen> createState() => _TeamMembersScreenState();
}

class _TeamMembersScreenState extends ConsumerState<TeamMembersScreen> {
  bool _isLoading = true;
  String? _errorMessage;
  List<Map<String, dynamic>> _members = [];
  final int _maxMembers = 10;
  Timer? _clipboardTimer;

  @override
  void dispose() {
    _clipboardTimer?.cancel();
    super.dispose();
  }

  void _copyToClipboardWithAutoClear(
    String text,
    BuildContext ctx,
    String msg,
  ) async {
    _clipboardTimer?.cancel();
    await Clipboard.setData(ClipboardData(text: text));
    if (ctx.mounted) {
      final l10n = GrsL10n.of(ctx);
      ScaffoldMessenger.of(ctx).showSnackBar(
        SnackBar(
          content: Text('$msg (${l10n.get('credentialsAutoClearNotice')})'),
          backgroundColor: GrsColors.syncSynced,
          duration: const Duration(seconds: 3),
        ),
      );
    }
    _clipboardTimer = Timer(const Duration(seconds: 30), () async {
      try {
        final current = await Clipboard.getData(Clipboard.kTextPlain);
        if (current?.text == text) {
          await Clipboard.setData(const ClipboardData(text: ''));
        }
      } catch (_) {}
    });
  }

  @override
  void initState() {
    super.initState();
    _fetchMembers();
  }

  Future<void> _fetchMembers() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      setState(() {
        _isLoading = false;
        _errorMessage = GrsL10n.of(context).get('internetRequiredTeamMembers');
      });
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final teamId = auth.user?.teamId;
      if (teamId == null || teamId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = GrsL10n.of(context).get('noTeamAssignedUser');
        });
        return;
      }

      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.getAccounts(teamId: teamId);

      List<dynamic> accountsRaw = [];
      if (response['accounts'] is List) {
        accountsRaw = response['accounts'] as List;
      } else if (response['data'] is List) {
        accountsRaw = response['data'] as List;
      } else if (response['items'] is List) {
        accountsRaw = response['items'] as List;
      }

      final members = accountsRaw.whereType<Map<String, dynamic>>().toList();

      if (mounted) {
        setState(() {
          _members = members;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = GrsL10n.of(
            context,
          ).translate('failedToLoadTeamMembers', {'error': e.toString()});
        });
      }
    }
  }

  int get _activeCount => _members.where((m) => m['isActive'] != false).length;

  Future<void> _showAddSingleMemberDialog() async {
    final createdCreds = await showDialog<Map<String, String>>(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => _AddSingleMemberDialog(
        onSubmit: (name, phone, lang) async {
          final auth = ref.read(authProvider);
          final teamId = auth.user?.teamId;
          final gnId = auth.user?.gnId;

          final apiClient = ref.read(apiClientProvider);
          final payload = <String, dynamic>{
            'fullName': name,
            'role': 'team_member',
            'preferredLanguage': lang,
            'teamId': teamId,
            'gnId': gnId,
          };
          if (phone != null && phone.isNotEmpty) {
            payload['phoneE164'] = phone;
          }

          final res = await apiClient.createAccount(payload);
          final user =
              (res['user'] is Map<String, dynamic> ? res['user'] : res)
                  as Map<String, dynamic>?;

          return {
            'fullName': user?['fullName']?.toString() ?? name,
            'userCode': user?['userCode']?.toString() ?? '',
            'initialPassword': user?['initialPassword']?.toString() ?? '',
          };
        },
        onError: _handleError,
      ),
    );

    if (createdCreds != null && mounted) {
      await _showEphemeralCredentialsModal([createdCreds]);
      _fetchMembers();
    }
  }

  Future<void> _showBulkAddDialog() async {
    final availableSlots = _maxMembers - _activeCount;
    final bulkCreds = await showDialog<List<Map<String, String>>>(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => _BulkAddDialog(
        availableSlots: availableSlots,
        onSubmit: (count, lang) async {
          final auth = ref.read(authProvider);
          final teamId = auth.user?.teamId;
          final gnId = auth.user?.gnId;

          final apiClient = ref.read(apiClientProvider);
          final payload = <String, dynamic>{
            'role': 'team_member',
            'count': count,
            'teamId': teamId,
            'gnId': gnId,
          };

          final res = await apiClient.createBulkAccounts(payload);
          final users = res['users'] as List?;
          return (users ?? [])
              .whereType<Map<String, dynamic>>()
              .map<Map<String, String>>(
                (u) => {
                  'fullName': (u['fullName'] ?? 'Team Member').toString(),
                  'userCode': (u['userCode'] ?? '').toString(),
                  'initialPassword': (u['initialPassword'] ?? '').toString(),
                },
              )
              .toList();
        },
        onError: _handleError,
      ),
    );

    if (bulkCreds != null && bulkCreds.isNotEmpty && mounted) {
      await _showEphemeralCredentialsModal(bulkCreds);
      _fetchMembers();
    }
  }

  /// M4.3: Ephemeral credential screen with copy/share.
  /// Credentials are NOT persisted anywhere (never stored in local DB or cache)
  /// and are cleared from memory the moment this dialog closes.
  Future<void> _showEphemeralCredentialsModal(
    List<Map<String, String>> credentials,
  ) async {
    final buffer = StringBuffer();
    buffer.writeln('GRS Team Member Credentials:');
    buffer.writeln('--------------------------------');
    for (final c in credentials) {
      buffer.writeln('Name: ${c['fullName']}');
      buffer.writeln('User ID: ${c['userCode']}');
      buffer.writeln('Initial Password: ${c['initialPassword']}');
      buffer.writeln('--------------------------------');
    }
    final formattedCredentials = buffer.toString();

    try {
      // Screenshot protection: prevent OS snapshots/recents capture while credentials are shown
      await SecurityService.enableScreenshotProtection();
      if (!mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (modalCtx) {
          final modalL10n = GrsL10n.of(modalCtx);
          return AlertDialog(
            title: Row(
              children: [
                const Icon(Icons.security, color: GrsColors.syncPending),
                const SizedBox(width: GrsSpacing.sm),
                Expanded(
                  child: Text(
                    modalL10n.get('oneTimeCredentials'),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(GrsSpacing.sm),
                      decoration: BoxDecoration(
                        color: GrsColors.syncPendingBg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: GrsColors.syncPending.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: GrsColors.syncPending,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              modalL10n.get('credentialsOneTimeWarning'),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF78350F),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),
                    ...credentials.map((c) {
                      final memberText =
                          'GRS Account:\nName: ${c['fullName']}\nUser ID: ${c['userCode']}\nPassword: ${c['initialPassword']}';
                      return Container(
                        margin: const EdgeInsets.only(bottom: GrsSpacing.sm),
                        padding: const EdgeInsets.all(GrsSpacing.sm),
                        decoration: BoxDecoration(
                          color: GrsColors.surfaceLight,
                          border: Border.all(color: GrsColors.outlineLight),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    c['fullName'] ?? 'Member',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.copy, size: 16),
                                  tooltip: modalL10n.get('copy'),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    _copyToClipboardWithAutoClear(
                                      memberText,
                                      modalCtx,
                                      modalL10n.get('credentialsCopied'),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.share, size: 16),
                                  tooltip: modalL10n.get('share'),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () async {
                                    try {
                                      await SharePlus.instance.share(
                                        ShareParams(text: memberText),
                                      );
                                    } catch (_) {}
                                  },
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Text(
                                  '${modalL10n.get('userId')}: ',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                                SelectableText(
                                  c['userCode'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                Text(
                                  '${modalL10n.get('password')}: ',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                                SelectableText(
                                  c['initialPassword'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: GrsColors.primaryLight,
                                    letterSpacing: 1.2,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
            actions: [
              OutlinedButton.icon(
                icon: const Icon(Icons.copy, size: 18),
                label: Text(modalL10n.get('copyAll')),
                onPressed: () {
                  _copyToClipboardWithAutoClear(
                    formattedCredentials,
                    modalCtx,
                    modalL10n.get('credentialsCopied'),
                  );
                },
              ),
              OutlinedButton.icon(
                icon: const Icon(Icons.share, size: 18),
                label: Text(modalL10n.get('shareAll')),
                onPressed: () async {
                  try {
                    await SharePlus.instance.share(
                      ShareParams(text: formattedCredentials),
                    );
                  } catch (_) {}
                },
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: GrsColors.primaryMid,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.of(modalCtx).pop();
                },
                child: Text(modalL10n.get('savedCredentials')),
              ),
            ],
          );
        },
      );
    } finally {
      // 1. Clear screenshot protection once the modal closes
      await SecurityService.disableScreenshotProtection();

      // 2. Clear all sensitive credentials from memory
      for (final c in credentials) {
        c.clear();
      }
      credentials.clear();
      buffer.clear();
    }
  }

  Future<void> _deactivateMember(String memberId, String fullName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final dlgL10n = GrsL10n.of(ctx);
        return AlertDialog(
          title: Text(dlgL10n.get('deactivateMemberTitle')),
          content: Text(
            dlgL10n.translate('deactivateMemberConfirm', {'name': fullName}),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(dlgL10n.get('cancel')),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: GrsColors.syncRejected,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(dlgL10n.get('deactivate')),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    setState(() => _isLoading = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.deactivateAccount(memberId);
      if (mounted) {
        final l10n = GrsL10n.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('memberDeactivatedSuccess', {'name': fullName}),
            ),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
      }
      _fetchMembers();
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        _handleError(e);
      }
    }
  }

  void _handleError(dynamic e) {
    final l10n = GrsL10n.of(context);
    String msg = e.toString();
    if (msg.contains('TEAM_MEMBER_LIMIT_EXCEEDED') ||
        msg.contains('capacity') ||
        msg.contains('limit exceeded')) {
      msg = l10n.get('teamCapacityLimit');
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: GrsColors.syncRejected,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final isOnline = ref.watch(connectivityProvider);
    final activeCount = _activeCount;

    return GrsScaffold(
      title: l10n.get('teamMembers'),
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage: l10n.get('onlineOnlyNotice'),
      body: Column(
        children: [
          // Team Capacity Status Card
          Padding(
            padding: const EdgeInsets.all(GrsSpacing.md),
            child: GrsCard(
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(GrsSpacing.sm),
                    decoration: BoxDecoration(
                      color: GrsColors.primaryLight.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.groups_outlined,
                      color: GrsColors.primaryLight,
                      size: 28,
                    ),
                  ),
                  const SizedBox(width: GrsSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.get('teamCapacity'),
                          style: const TextStyle(
                            fontSize: 12,
                            color: GrsColors.textSecondaryLight,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$activeCount / $_maxMembers ${l10n.get('activeMembers')}',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: activeCount >= _maxMembers
                                ? GrsColors.syncRejected
                                : GrsColors.textPrimaryLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (activeCount < _maxMembers && isOnline) ...[
                    IconButton.filledTonal(
                      icon: const Icon(Icons.person_add_outlined),
                      tooltip: l10n.get('addMember'),
                      onPressed: _showAddSingleMemberDialog,
                    ),
                    const SizedBox(width: GrsSpacing.xs),
                    IconButton.filled(
                      icon: const Icon(Icons.group_add_outlined),
                      tooltip: l10n.get('bulkAdd'),
                      onPressed: _showBulkAddDialog,
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Members List
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
                            onPressed: _fetchMembers,
                            child: Text(l10n.get('retry')),
                          ),
                        ],
                      ),
                    ),
                  )
                : _members.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.person_off_outlined,
                          size: 48,
                          color: GrsColors.textSecondaryLight,
                        ),
                        const SizedBox(height: GrsSpacing.sm),
                        Text(
                          l10n.get('noTeamMembersFound'),
                          style: const TextStyle(
                            fontSize: 14,
                            color: GrsColors.textSecondaryLight,
                          ),
                        ),
                        const SizedBox(height: GrsSpacing.md),
                        if (isOnline)
                          ElevatedButton.icon(
                            icon: const Icon(Icons.person_add),
                            label: Text(l10n.get('addMember')),
                            onPressed: _showAddSingleMemberDialog,
                          ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _fetchMembers,
                    child: ListView.separated(
                      padding: const EdgeInsets.symmetric(
                        horizontal: GrsSpacing.md,
                        vertical: GrsSpacing.xs,
                      ),
                      itemCount: _members.length,
                      separatorBuilder: (ctx, idx) =>
                          const SizedBox(height: GrsSpacing.xs),
                      itemBuilder: (ctx, idx) {
                        final member = _members[idx];
                        final name = member['fullName'] ?? 'Unnamed';
                        final userCode = member['userCode'] ?? '';
                        final phone = member['phoneE164'] ?? '';
                        final isActive = member['isActive'] != false;
                        final role = member['role'] ?? 'team_member';
                        final id = member['id'] ?? '';

                        return GrsCard(
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: GrsSpacing.sm,
                              vertical: 2,
                            ),
                            leading: CircleAvatar(
                              backgroundColor: isActive
                                  ? GrsColors.primaryLight.withValues(
                                      alpha: 0.12,
                                    )
                                  : GrsColors.outlineLight,
                              child: Icon(
                                Icons.person,
                                color: isActive
                                    ? GrsColors.primaryLight
                                    : GrsColors.textSecondaryLight,
                              ),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    name,
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      decoration: isActive
                                          ? null
                                          : TextDecoration.lineThrough,
                                    ),
                                  ),
                                ),
                                if (!isActive)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: GrsColors.outlineLight,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      l10n.get('deactivate'),
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: GrsColors.textSecondaryLight,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ID: $userCode  •  Role: $role',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                                if (phone.isNotEmpty)
                                  Text(
                                    '${l10n.get('phoneNumber')}: $phone',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: GrsColors.textSecondaryLight,
                                    ),
                                  ),
                              ],
                            ),
                            trailing:
                                isActive && role != 'cdc_secretary' && isOnline
                                ? IconButton(
                                    icon: const Icon(
                                      Icons.person_remove_outlined,
                                      color: GrsColors.syncRejected,
                                    ),
                                    tooltip: l10n.get('deactivate'),
                                    onPressed: () =>
                                        _deactivateMember(id, name),
                                  )
                                : null,
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

class _AddSingleMemberDialog extends StatefulWidget {
  final Future<Map<String, String>?> Function(
    String fullName,
    String? phone,
    String lang,
  )
  onSubmit;
  final void Function(dynamic error) onError;

  const _AddSingleMemberDialog({required this.onSubmit, required this.onError});

  @override
  State<_AddSingleMemberDialog> createState() => _AddSingleMemberDialogState();
}

class _AddSingleMemberDialogState extends State<_AddSingleMemberDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  String _selectedLang = 'si';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _phoneCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dlgL10n = GrsL10n.of(context);
    return AlertDialog(
      title: Text(dlgL10n.get('addTeamMember')),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              GrsTextField(
                controller: _nameCtrl,
                label: dlgL10n.get('fullName'),
                hint: 'e.g. Kasun Silva',
                prefixIcon: const Icon(Icons.person_outline),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return dlgL10n.get('pleaseEnterFullName');
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _phoneCtrl,
                label: dlgL10n.get('phoneNumber'),
                hint: 'e.g. +94771234567',
                prefixIcon: const Icon(Icons.phone_outlined),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: GrsSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: _selectedLang,
                decoration: InputDecoration(
                  labelText: dlgL10n.get('preferredLanguage'),
                  border: const OutlineInputBorder(),
                ),
                items: [
                  DropdownMenuItem(
                    value: 'si',
                    child: Text(dlgL10n.get('sinhalaOption')),
                  ),
                  DropdownMenuItem(
                    value: 'ta',
                    child: Text(dlgL10n.get('tamilOption')),
                  ),
                  DropdownMenuItem(
                    value: 'en',
                    child: Text(dlgL10n.get('englishOption')),
                  ),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedLang = val);
                  }
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(null),
          child: Text(dlgL10n.get('cancel')),
        ),
        ElevatedButton(
          onPressed: _isLoading
              ? null
              : () async {
                  if (!_formKey.currentState!.validate()) {
                    return;
                  }
                  setState(() => _isLoading = true);
                  try {
                    final res = await widget.onSubmit(
                      _nameCtrl.text.trim(),
                      _phoneCtrl.text.trim().isEmpty
                          ? null
                          : _phoneCtrl.text.trim(),
                      _selectedLang,
                    );
                    if (context.mounted) {
                      Navigator.of(context).pop(res);
                    }
                  } catch (e) {
                    if (mounted) {
                      setState(() => _isLoading = false);
                    }
                    if (context.mounted) {
                      Navigator.of(context).pop(null);
                    }
                    widget.onError(e);
                  }
                },
          child: _isLoading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(dlgL10n.get('create')),
        ),
      ],
    );
  }
}

class _BulkAddDialog extends StatefulWidget {
  final int availableSlots;
  final Future<List<Map<String, String>>?> Function(int count, String lang)
  onSubmit;
  final void Function(dynamic error) onError;

  const _BulkAddDialog({
    required this.availableSlots,
    required this.onSubmit,
    required this.onError,
  });

  @override
  State<_BulkAddDialog> createState() => _BulkAddDialogState();
}

class _BulkAddDialogState extends State<_BulkAddDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _countCtrl;
  String _selectedLang = 'si';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _countCtrl = TextEditingController(text: '2');
  }

  @override
  void dispose() {
    _countCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dlgL10n = GrsL10n.of(context);
    return AlertDialog(
      title: Text(dlgL10n.get('bulkAddMembers')),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(GrsSpacing.sm),
                decoration: BoxDecoration(
                  color: GrsColors.primaryLight.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  dlgL10n.translate('availableCapacity', {
                    'count': '${widget.availableSlots}',
                  }),
                  style: const TextStyle(
                    fontSize: 13,
                    color: GrsColors.primaryLight,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _countCtrl,
                label: dlgL10n.get('numberOfMembers'),
                hint: 'e.g. 3',
                prefixIcon: const Icon(Icons.group_add_outlined),
                keyboardType: TextInputType.number,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return dlgL10n.get('pleaseEnterCount');
                  }
                  final parsed = int.tryParse(val.trim());
                  if (parsed == null || parsed < 1 || parsed > 10) {
                    return dlgL10n.get('countBetween1And10');
                  }
                  if (parsed > widget.availableSlots) {
                    return dlgL10n.translate('exceedsAvailableCapacity', {
                      'count': '${widget.availableSlots}',
                    });
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: _selectedLang,
                decoration: InputDecoration(
                  labelText: dlgL10n.get('preferredLanguage'),
                  border: const OutlineInputBorder(),
                ),
                items: [
                  DropdownMenuItem(
                    value: 'si',
                    child: Text(dlgL10n.get('sinhalaOption')),
                  ),
                  DropdownMenuItem(
                    value: 'ta',
                    child: Text(dlgL10n.get('tamilOption')),
                  ),
                  DropdownMenuItem(
                    value: 'en',
                    child: Text(dlgL10n.get('englishOption')),
                  ),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedLang = val);
                  }
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(null),
          child: Text(dlgL10n.get('cancel')),
        ),
        ElevatedButton(
          onPressed: _isLoading
              ? null
              : () async {
                  if (!_formKey.currentState!.validate()) return;
                  final count = int.parse(_countCtrl.text.trim());
                  setState(() => _isLoading = true);
                  try {
                    final res = await widget.onSubmit(count, _selectedLang);
                    if (context.mounted) {
                      Navigator.of(context).pop(res);
                    }
                  } catch (e) {
                    if (mounted) {
                      setState(() => _isLoading = false);
                    }
                    if (context.mounted) {
                      Navigator.of(context).pop(null);
                    }
                    widget.onError(e);
                  }
                },
          child: _isLoading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(dlgL10n.get('createBatch')),
        ),
      ],
    );
  }
}
