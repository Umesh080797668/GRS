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
      setState(() {
        _isLoading = false;
        _errorMessage = 'Internet connection required to load GN setup.';
      });
      return;
    }

    try {
      final auth = ref.read(authProvider);
      final gnId = auth.profile?.gnId;
      if (gnId == null || gnId.isEmpty) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'No GN division assigned to the current user.';
        });
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
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load GN details: ${e.toString()}';
        });
      }
    }
  }

  Future<void> _saveGnDetails() async {
    if (!_formKey.currentState!.validate()) return;

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Internet connection required to save changes.'),
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
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('GN division details updated successfully.'),
            backgroundColor: GrsColors.syncSynced,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update GN division: ${e.toString()}'),
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
                      GrsButton(label: 'Retry', onPressed: _loadGnDetails),
                    ],
                  ),
                )
              else ...[
                GrsCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'GN Division Info',
                        style: TextStyle(
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
                                const Text(
                                  'GN Number',
                                  style: TextStyle(
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
                                const Text(
                                  'GN Name',
                                  style: TextStyle(
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
                const Text(
                  'CDC Secretary Contact Details',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _nameController,
                  label: 'Secretary Full Name',
                  hint: 'Enter CDC Secretary full name',
                  enabled: isOnline && !_isSaving,
                  prefixIcon: const Icon(Icons.person_outline),
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return 'Secretary name is required.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _contactController,
                  label: 'Contact Number',
                  hint: 'e.g. +94771234567',
                  keyboardType: TextInputType.phone,
                  enabled: isOnline && !_isSaving,
                  prefixIcon: const Icon(Icons.phone_outlined),
                ),
                const SizedBox(height: GrsSpacing.md),
                GrsTextField(
                  controller: _emailController,
                  label: 'Email Address',
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
                        return 'Invalid email address format.';
                      }
                    }
                    return null;
                  },
                ),
                const SizedBox(height: GrsSpacing.xl),
                GrsButton(
                  label: _isSaving ? 'Saving...' : 'Save GN Division Details',
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
