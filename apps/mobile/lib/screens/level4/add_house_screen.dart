import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';

/// Screen for Level 4 (CDC Secretary) to add a house pre-visit (M4.4 / Form DD/S/002).
///
/// Pre-visit typed entry based on voter / election lists.
/// Concurrency-safe serial numbers are allocated dynamically by the API backend (M4.1).
/// Online-only writes: offline shows a clear "needs internet" state, never a crash.
class AddHouseScreen extends ConsumerStatefulWidget {
  const AddHouseScreen({super.key});

  @override
  ConsumerState<AddHouseScreen> createState() => _AddHouseScreenState();
}

class _AddHouseScreenState extends ConsumerState<AddHouseScreen> {
  final _formKey = GlobalKey<FormState>();
  final _houseNoCtrl = TextEditingController();
  final _leaderNameCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _villageNameCtrl = TextEditingController();
  final _targetFemaleCtrl = TextEditingController();
  final _targetMaleCtrl = TextEditingController();
  final _ageGroupCtrl = TextEditingController();

  bool _isEpf = false;
  bool _isEtf = false;
  bool _isAswesuma = false;
  bool _isSamurdhi = false;
  bool _hasSpecialNeeds = false;

  bool _langSinhala = true;
  bool _langTamil = false;
  bool _langEnglish = false;

  bool _isSaving = false;

  @override
  void dispose() {
    _houseNoCtrl.dispose();
    _leaderNameCtrl.dispose();
    _addressCtrl.dispose();
    _villageNameCtrl.dispose();
    _targetFemaleCtrl.dispose();
    _targetMaleCtrl.dispose();
    _ageGroupCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitHouse() async {
    if (!_formKey.currentState!.validate()) return;

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Internet connection required for this action.'),
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

      int? ageMin;
      int? ageMax;
      final ageParts = _ageGroupCtrl.text.trim().split('-');
      if (ageParts.length == 2) {
        ageMin = int.tryParse(ageParts[0].trim());
        ageMax = int.tryParse(ageParts[1].trim());
      }

      final payload = {
        'gnId': gnId,
        'houseNo': _houseNoCtrl.text.trim(),
        'houseLeaderName': _leaderNameCtrl.text.trim(),
        'address': _addressCtrl.text.trim().isNotEmpty
            ? _addressCtrl.text.trim()
            : null,
        'villageName': _villageNameCtrl.text.trim().isNotEmpty
            ? _villageNameCtrl.text.trim()
            : null,
        'isEpf': _isEpf,
        'isEtf': _isEtf,
        'isAswesuma': _isAswesuma,
        'isSamurdhi': _isSamurdhi,
        'hasSpecialNeeds': _hasSpecialNeeds,
        'targetFemale': int.tryParse(_targetFemaleCtrl.text.trim()) ?? 0,
        'targetMale': int.tryParse(_targetMaleCtrl.text.trim()) ?? 0,
        'ageGroupMin': ageMin,
        'ageGroupMax': ageMax,
        'langSinhala': _langSinhala,
        'langTamil': _langTamil,
        'langEnglish': _langEnglish,
      };

      final apiClient = ref.read(apiClientProvider);
      final created = await apiClient.createHousehold(payload);

      // Save into local Drift database immediately
      final db = await ref.read(databaseProvider.future);
      final household = Household.fromJson(created);
      await db.upsertHousehold(household);

      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: GrsColors.syncSynced),
                SizedBox(width: 8),
                Text('House Registered'),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'House No: ${created['houseNo']}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  'Allocated Serial: #${created['serialNo']}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: GrsColors.primaryLight,
                  ),
                ),
                const SizedBox(height: 4),
                Text('Leader: ${created['houseLeaderName']}'),
                const SizedBox(height: 12),
                const Text(
                  'This house is now added to the GN division pool and available for team claiming.',
                  style: TextStyle(
                    fontSize: 12,
                    color: GrsColors.textSecondaryLight,
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _resetForm();
                },
                child: const Text('Add Another'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: GrsColors.primaryMid,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.of(ctx).pop();
                  Navigator.of(context).pop(true);
                },
                child: const Text('Done'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        String msg = e.toString();
        if (msg.contains('HOUSEHOLD_ALREADY_EXISTS')) {
          msg = 'A house with this number already exists in your GN division.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: GrsColors.syncRejected),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _resetForm() {
    _houseNoCtrl.clear();
    _leaderNameCtrl.clear();
    _addressCtrl.clear();
    _villageNameCtrl.clear();
    _targetFemaleCtrl.clear();
    _targetMaleCtrl.clear();
    _ageGroupCtrl.clear();
    setState(() {
      _isEpf = false;
      _isEtf = false;
      _isAswesuma = false;
      _isSamurdhi = false;
      _hasSpecialNeeds = false;
      _langSinhala = true;
      _langTamil = false;
      _langEnglish = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = ref.watch(connectivityProvider);
    final l10n = GrsL10n.of(context);

    return GrsScaffold(
      title: l10n.get('addHouse'),
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
              const GrsCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Pre-Visit Household Data (DD/S/002)',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: GrsSpacing.sm),
                    Text(
                      'Enter house information from election name list. Serial number is allocated automatically.',
                      style: TextStyle(
                        fontSize: 12,
                        color: GrsColors.textSecondaryLight,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: GrsSpacing.lg),
              GrsTextField(
                controller: _houseNoCtrl,
                label: 'House Number *',
                hint: 'e.g. 24/A or 105',
                prefixIcon: const Icon(Icons.home_outlined),
                enabled: isOnline && !_isSaving,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Please enter a house number.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _leaderNameCtrl,
                label: 'House Leader Name *',
                hint: 'Full name of head of household',
                prefixIcon: const Icon(Icons.person_outline),
                enabled: isOnline && !_isSaving,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Please enter house leader name.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _addressCtrl,
                label: 'Street / Address',
                hint: 'Optional street address',
                prefixIcon: const Icon(Icons.location_on_outlined),
                enabled: isOnline && !_isSaving,
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _villageNameCtrl,
                label: 'Village Name',
                hint: 'e.g. Walpola',
                prefixIcon: const Icon(Icons.map_outlined),
                enabled: isOnline && !_isSaving,
              ),
              const SizedBox(height: GrsSpacing.lg),
              const Text(
                'Beneficiary Flags (Per House)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: GrsSpacing.xs),
              CheckboxListTile(
                title: const Text('EPF (Employees Provident Fund)'),
                value: _isEpf,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isEpf = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: const Text('ETF (Employees Trust Fund)'),
                value: _isEtf,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isEtf = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: const Text('Aswesuma Beneficiary'),
                value: _isAswesuma,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isAswesuma = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: const Text('Samurdhi Beneficiary'),
                value: _isSamurdhi,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isSamurdhi = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: const Text('Special Needs in Household'),
                value: _hasSpecialNeeds,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _hasSpecialNeeds = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: GrsSpacing.lg),
              const Text(
                'Target Demographics',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: GrsSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: GrsTextField(
                      controller: _targetFemaleCtrl,
                      label: 'Target Female',
                      hint: '0',
                      prefixIcon: const Icon(Icons.woman),
                      keyboardType: TextInputType.number,
                      enabled: isOnline && !_isSaving,
                    ),
                  ),
                  const SizedBox(width: GrsSpacing.md),
                  Expanded(
                    child: GrsTextField(
                      controller: _targetMaleCtrl,
                      label: 'Target Male',
                      hint: '0',
                      prefixIcon: const Icon(Icons.man),
                      keyboardType: TextInputType.number,
                      enabled: isOnline && !_isSaving,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _ageGroupCtrl,
                label: 'Age Group',
                hint: 'e.g. 18-25',
                prefixIcon: const Icon(Icons.calendar_month_outlined),
                enabled: isOnline && !_isSaving,
              ),
              const SizedBox(height: GrsSpacing.lg),
              const Text(
                'Languages Used',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              Wrap(
                spacing: GrsSpacing.sm,
                children: [
                  FilterChip(
                    label: const Text('Sinhala (සිංහල)'),
                    selected: _langSinhala,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langSinhala = s)
                        : null,
                  ),
                  FilterChip(
                    label: const Text('Tamil (தமிழ்)'),
                    selected: _langTamil,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langTamil = s)
                        : null,
                  ),
                  FilterChip(
                    label: const Text('English'),
                    selected: _langEnglish,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langEnglish = s)
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: GrsSpacing.xl),
              GrsButton(
                label: _isSaving
                    ? 'Registering...'
                    : 'Register House (Allocates Serial)',
                onPressed: isOnline && !_isSaving ? _submitHouse : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
