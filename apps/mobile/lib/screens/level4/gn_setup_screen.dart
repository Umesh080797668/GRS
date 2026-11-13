import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';

/// Screen for Level 4 (CDC Secretary) to set up and manage GN division details (M4.4).
///
/// Online-only writes: GN division configuration requires live API connection.
/// Offline mode shows a clear, non-crash banner explaining internet requirement.
class GnSetupScreen extends ConsumerStatefulWidget {
  const GnSetupScreen({super.key});

  @override
  ConsumerState<GnSetupScreen> createState() => _GnSetupScreenState();
}

class _GnSetupScreenState extends ConsumerState<GnSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();
  final _emailController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorMessage;
  String? _gnName;
  String? _gnNumber;

  @override
  void initState() {
    super.initState();
    _loadGnDetails();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contactController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _loadGnDetails() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      if (mounted) {
        final l10n = GrsL10n.of(context);
        setState(() {
          _isLoading = false;
          _errorMessage = l10n.get('internetRequiredAction');
        });
      }
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final gnId = auth.profile?.gnId;
      if (gnId == null || gnId.isEmpty) {
        if (mounted) {
          final l10n = GrsL10n.of(context);
          setState(() {
            _isLoading = false;
            _errorMessage = l10n.get('noGnDivisionAssigned');
          });
        }
        return;
      }

      final apiClient = ref.read(apiClientProvider);
      final gnData = await apiClient.getGnDivision(gnId);

      if (mounted) {
        setState(() {
          _gnName = gnData['name'] as String?;
          _gnNumber = gnData['gnNumber'] as String?;
          _nameController.text = gnData['secretaryName'] as String? ?? '';
          _contactController.text = gnData['secretaryContact'] as String? ?? '';
          _emailController.text = gnData['secretaryEmail'] as String? ?? '';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        final l10n = GrsL10n.of(context);
        setState(() {
          _isLoading = false;
          _errorMessage = l10n.translate('failedWithError', {
            'error': e.toString(),
          });
        });
      }
    }
  }

  Future<void> _saveGnDetails() async {
    if (!_formKey.currentState!.validate()) return;

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      final l10n = GrsL10n.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.get('internetRequiredSave')),
          backgroundColor: GrsColors.syncRejected,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final auth = ref.read(authProvider);
      final gnId = auth.profile?.gnId;
      if (gnId == null || gnId.isEmpty) {
        throw Exception('User has no assigned GN division.');
      }

      final apiClient = ref.read(apiClientProvider);
      await apiClient.updateGnDivision(gnId, {
        'secretaryName': _nameController.text.trim(),
        'secretaryContact': _contactController.text.trim().isNotEmpty
            ? _contactController.text.trim()
            : null,
        'secretaryEmail': _emailController.text.trim().isNotEmpty
            ? _emailController.text.trim()
            : null,
      });

      if (mounted) {
        final l10n = GrsL10n.of(context);
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.get('gnDetailsUpdatedSuccess')),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        final l10n = GrsL10n.of(context);
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.translate('failedToUpdateGn', {'error': e.toString()}),
            ),
            backgroundColor: GrsColors.syncRejected,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = ref.watch(connectivityProvider);
    final l10n = GrsL10n.of(context);

    return GrsScaffold(
      title: l10n.get('gnSetup'),
      showBackButton: true,
      isOffline: !isOnline,
      offlineMessage: l10n.get('onlineOnlyNotice'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(GrsSpacing.lg),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_isLoading)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(GrsSpacing.xl),
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_errorMessage != null)
                GrsCard(
                  child: Column(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 48,
                        color: GrsColors.syncRejected,
                      ),
                      const SizedBox(height: GrsSpacing.sm),
                      Text(
                        _errorMessage!,
                        style: const TextStyle(fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: GrsSpacing.md),
                      GrsButton(
                        label: l10n.get('retry'),
                        onPressed: _loadGnDetails,
                      ),
                    ],
                  ),
                )
              else ...[
                GrsCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.get('gnDivisionDetails'),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l10n.get('gnNumber'),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                                Text(
                                  _gnNumber ?? '-',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l10n.get('gnName'),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: GrsColors.textSecondaryLight,
                                  ),
                                ),
                                Text(
                                  _gnName ?? '-',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: GrsSpacing.lg),
                GrsTextField(
                  controller: _nameController,
                  label: l10n.get('fullName'),
                  hint: l10n.get('fullName'),
                  enabled: isOnline && !_isSaving,
                  prefixIcon: const Icon(Icons.person_outline),
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return l10n.get('pleaseEnterLeaderName');
                    }
                    return null;
                  },
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _contactController,
                  label: l10n.get('phoneNumber'),
                  hint: 'e.g. +94771234567',
                  keyboardType: TextInputType.phone,
                  enabled: isOnline && !_isSaving,
                  prefixIcon: const Icon(Icons.phone_outlined),
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _emailController,
                  label: l10n.get('emailLabel'),
                  hint: 'e.g. secretary@gn.gov.lk',
                  keyboardType: TextInputType.emailAddress,
                  enabled: isOnline && !_isSaving,
                  prefixIcon: const Icon(Icons.email_outlined),
                  validator: (val) {
                    if (val != null && val.trim().isNotEmpty) {
                      final emailRegex = RegExp(
                        r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
                      );
                      if (!emailRegex.hasMatch(val.trim())) {
                        return l10n.get('invalidCredentialsError');
                      }
                    }
                    return null;
                  },
                ),
                const SizedBox(height: GrsSpacing.xl),
                GrsButton(
                  label: _isSaving ? '...' : l10n.get('saveChanges'),
                  onPressed: isOnline && !_isSaving ? _saveGnDetails : null,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
