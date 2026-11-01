import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';

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
  bool _actionInProgress = false;

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
        _errorMessage = 'Internet connection required to view team members.';
      });
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final teamId = auth.user?.teamId;
      if (teamId == null || teamId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'No team assigned to current user.';
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
          _errorMessage = 'Failed to load team members: ${e.toString()}';
        });
      }
    }
  }

  int get _activeCount => _members.where((m) => m['isActive'] != false).length;

  Future<void> _showAddSingleMemberDialog() async {
    final formKey = GlobalKey<FormState>();
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String selectedLang = 'si';

    await showDialog<bool>(
      context: context,
      barrierDismissible: !_actionInProgress,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Add Team Member'),
              content: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      GrsTextField(
                        controller: nameCtrl,
                        label: 'Full Name',
                        hint: 'e.g. Kasun Silva',
                        prefixIcon: const Icon(Icons.person_outline),
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) {
                            return 'Please enter member full name';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: GrsSpacing.md),
                      GrsTextField(
                        controller: phoneCtrl,
                        label: 'Phone Number (Optional)',
                        hint: 'e.g. +94771234567',
                        prefixIcon: const Icon(Icons.phone_outlined),
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: GrsSpacing.md),
                      DropdownButtonFormField<String>(
                        initialValue: selectedLang,
                        decoration: const InputDecoration(
                          labelText: 'Preferred Language',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'si',
                            child: Text('Sinhala (සිංහල)'),
                          ),
                          DropdownMenuItem(
                            value: 'ta',
                            child: Text('Tamil (தமிழ்)'),
                          ),
                          DropdownMenuItem(value: 'en', child: Text('English')),
                        ],
                        onChanged: (val) {
                          if (val != null) {
                            setDialogState(() => selectedLang = val);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: _actionInProgress
                      ? null
                      : () => Navigator.of(dialogCtx).pop(false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: _actionInProgress
                      ? null
                      : () async {
                          if (!formKey.currentState!.validate()) return;
                          setDialogState(() => _actionInProgress = true);

                          try {
                            final auth = ref.read(authProvider);
                            final teamId = auth.user?.teamId;
                            final gnId = auth.user?.gnId;

                            final apiClient = ref.read(apiClientProvider);
                            final payload = <String, dynamic>{
                              'fullName': nameCtrl.text.trim(),
                              'role': 'team_member',
                              'preferredLanguage': selectedLang,
                              'teamId': teamId,
                              'gnId': gnId,
                            };
                            if (phoneCtrl.text.trim().isNotEmpty) {
                              payload['phoneE164'] = phoneCtrl.text.trim();
                            }

                            final res = await apiClient.createAccount(payload);
                            setDialogState(() => _actionInProgress = false);

                            if (dialogCtx.mounted) {
                              Navigator.of(dialogCtx).pop(true);
                            }

                            // Show ephemeral one-time credentials
                            final user = res['user'] as Map<String, dynamic>?;
                            if (user != null && mounted) {
                              await _showEphemeralCredentialsModal([
                                {
                                  'fullName':
                                      user['fullName'] ?? nameCtrl.text.trim(),
                                  'userCode': user['userCode'] ?? '',
                                  'initialPassword':
                                      user['initialPassword'] ?? '',
                                },
                              ]);
                              _fetchMembers();
                            }
                          } catch (e) {
                            setDialogState(() => _actionInProgress = false);
                            if (dialogCtx.mounted) {
                              Navigator.of(dialogCtx).pop(false);
                            }
                            _handleError(e);
                          }
                        },
                  child: _actionInProgress
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Create'),
                ),
              ],
            );
          },
        );
      },
    );

    nameCtrl.dispose();
    phoneCtrl.dispose();
  }

  Future<void> _showBulkAddDialog() async {
    final formKey = GlobalKey<FormState>();
    final countCtrl = TextEditingController(text: '2');
    String selectedLang = 'si';

    await showDialog<bool>(
      context: context,
      barrierDismissible: !_actionInProgress,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final availableSlots = _maxMembers - _activeCount;
            return AlertDialog(
              title: const Text('Bulk Add Team Members'),
              content: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Create multiple accounts at once. System will automatically generate sequential IDs and passwords.',
                        style: TextStyle(
                          fontSize: 12,
                          color: GrsColors.textSecondaryLight,
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.sm),
                      Container(
                        padding: const EdgeInsets.all(GrsSpacing.sm),
                        decoration: BoxDecoration(
                          color: GrsColors.primaryLight.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Available capacity: $availableSlots slot(s) remaining.',
                          style: const TextStyle(
                            fontSize: 13,
                            color: GrsColors.primaryLight,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.md),
                      GrsTextField(
                        controller: countCtrl,
                        label: 'Number of Members (1 - 10)',
                        hint: 'e.g. 3',
                        prefixIcon: const Icon(Icons.group_add_outlined),
                        keyboardType: TextInputType.number,
                        validator: (val) {
                          if (val == null || val.trim().isEmpty) {
                            return 'Please enter a count';
                          }
                          final parsed = int.tryParse(val.trim());
                          if (parsed == null || parsed < 1 || parsed > 10) {
                            return 'Count must be between 1 and 10';
                          }
                          if (parsed > availableSlots) {
                            return 'Exceeds available capacity ($availableSlots slots)';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: GrsSpacing.md),
                      DropdownButtonFormField<String>(
                        initialValue: selectedLang,
                        decoration: const InputDecoration(
                          labelText: 'Preferred Language for All',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'si',
                            child: Text('Sinhala (සිංහල)'),
                          ),
                          DropdownMenuItem(
                            value: 'ta',
                            child: Text('Tamil (தமிழ்)'),
                          ),
                          DropdownMenuItem(value: 'en', child: Text('English')),
                        ],
                        onChanged: (val) {
                          if (val != null) {
                            setDialogState(() => selectedLang = val);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: _actionInProgress
                      ? null
                      : () => Navigator.of(dialogCtx).pop(false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: _actionInProgress
                      ? null
                      : () async {
                          if (!formKey.currentState!.validate()) return;
                          final count = int.parse(countCtrl.text.trim());
                          setDialogState(() => _actionInProgress = true);

                          try {
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

                            final res = await apiClient.createBulkAccounts(
                              payload,
                            );
                            setDialogState(() => _actionInProgress = false);

                            if (dialogCtx.mounted) {
                              Navigator.of(dialogCtx).pop(true);
                            }

                            // Show ephemeral one-time credentials
                            final users = res['users'] as List?;
                            if (users != null && mounted) {
                              final credList = users
                                  .whereType<Map<String, dynamic>>()
                                  .map<Map<String, String>>(
                                    (u) => {
                                      'fullName':
                                          (u['fullName'] ?? 'Team Member')
                                              .toString(),
                                      'userCode': (u['userCode'] ?? '')
                                          .toString(),
                                      'initialPassword':
                                          (u['initialPassword'] ?? '')
                                              .toString(),
                                    },
                                  )
                                  .toList();
                              await _showEphemeralCredentialsModal(credList);
                              _fetchMembers();
                            }
                          } catch (e) {
                            setDialogState(() => _actionInProgress = false);
                            if (dialogCtx.mounted) {
                              Navigator.of(dialogCtx).pop(false);
                            }
                            _handleError(e);
                          }
                        },
                  child: _actionInProgress
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Create Batch'),
                ),
              ],
            );
          },
        );
      },
    );

    countCtrl.dispose();
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

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (modalCtx) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.security, color: GrsColors.syncPending),
              SizedBox(width: GrsSpacing.sm),
              Expanded(
                child: Text(
                  'One-Time Credentials',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
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
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          color: GrsColors.syncPending,
                          size: 20,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'WARNING: These passwords will ONLY be displayed once! They will NOT be accessible after closing this window. Please copy or share them now.',
                            style: TextStyle(
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
                          Text(
                            c['fullName'] ?? 'Member',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Text(
                                'User ID: ',
                                style: TextStyle(
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
                              const Text(
                                'Password: ',
                                style: TextStyle(
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
              label: const Text('Copy All'),
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(text: formattedCredentials),
                );
                if (modalCtx.mounted) {
                  ScaffoldMessenger.of(modalCtx).showSnackBar(
                    const SnackBar(
                      content: Text('Credentials copied to clipboard!'),
                      backgroundColor: GrsColors.syncSynced,
                    ),
                  );
                }
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
              child: const Text('I Have Saved Them'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _deactivateMember(String memberId, String fullName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deactivate Member?'),
        content: Text(
          'Are you sure you want to deactivate "$fullName"? They will no longer be able to log in or collect survey responses.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: GrsColors.syncRejected,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isLoading = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.deactivateAccount(memberId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Member "$fullName" deactivated'),
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
    String msg = e.toString();
    if (msg.contains('TEAM_MEMBER_LIMIT_EXCEEDED') ||
        msg.contains('capacity') ||
        msg.contains('limit exceeded')) {
      msg = 'Cannot add member: Team capacity limit reached (max 10 members).';
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
    final isOnline = ref.watch(connectivityProvider);
    final activeCount = _activeCount;

    return GrsScaffold(
      title: 'Team Members',
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage:
          'Offline mode. Team member management requires an internet connection.',
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
                        const Text(
                          'Team Capacity',
                          style: TextStyle(
                            fontSize: 12,
                            color: GrsColors.textSecondaryLight,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$activeCount / $_maxMembers Members',
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
                      tooltip: 'Add Single Member',
                      onPressed: _showAddSingleMemberDialog,
                    ),
                    const SizedBox(width: GrsSpacing.xs),
                    IconButton.filled(
                      icon: const Icon(Icons.group_add_outlined),
                      tooltip: 'Bulk Add Members',
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
                            child: const Text('Retry'),
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
                        const Text(
                          'No team members registered yet.',
                          style: TextStyle(
                            fontSize: 14,
                            color: GrsColors.textSecondaryLight,
                          ),
                        ),
                        const SizedBox(height: GrsSpacing.md),
                        if (isOnline)
                          ElevatedButton.icon(
                            icon: const Icon(Icons.person_add),
                            label: const Text('Add First Member'),
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
                                    child: const Text(
                                      'Deactivated',
                                      style: TextStyle(
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
                                    'Phone: $phone',
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
                                    tooltip: 'Deactivate Member',
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
