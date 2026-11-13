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

    if (!_langSinhala && !_langTamil && !_langEnglish) {
      final l10n = GrsL10n.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.get('selectAtLeastOneLanguage').isNotEmpty
                ? l10n.get('selectAtLeastOneLanguage')
                : 'Please select at least one preferred language.',
          ),
          backgroundColor: GrsColors.syncRejected,
        ),
      );
      return;
    }

    final isOnline = ref.read(connectivityProvider);
    if (!isOnline) {
      final l10n = GrsL10n.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.get('internetRequiredAction')),
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
        final dlgL10n = GrsL10n.of(context);
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: Row(
              children: [
                const Icon(Icons.check_circle, color: GrsColors.syncSynced),
                const SizedBox(width: 8),
                Text(dlgL10n.get('houseRegisteredTitle')),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${dlgL10n.get('houseNumber')}: ${created['houseNo']}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  dlgL10n.translate('allocatedSerialLabel', {
                    'serial': '${created['serialNo']}',
                  }),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: GrsColors.primaryLight,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  dlgL10n.translate('leaderLabel', {
                    'name': '${created['houseLeaderName']}',
                  }),
                ),
                const SizedBox(height: 12),
                Text(
                  dlgL10n.get('housePoolNotice'),
                  style: const TextStyle(
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
                child: Text(dlgL10n.get('addAnother')),
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
                child: Text(dlgL10n.get('done')),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        String msg = e.toString();
        if (msg.contains('HOUSEHOLD_ALREADY_EXISTS')) {
          msg = GrsL10n.of(context).get('houseAlreadyExists');
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
              GrsCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.get('preVisitHouseholdDataTitle'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.sm),
                    Text(
                      l10n.get('preVisitHouseholdDataDesc'),
                      style: const TextStyle(
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
                label: '${l10n.get('houseNumber')} *',
                hint: l10n.get('houseNumberHint'),
                prefixIcon: const Icon(Icons.home_outlined),
                enabled: isOnline && !_isSaving,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return l10n.get('pleaseEnterHouseNo');
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _leaderNameCtrl,
                label: '${l10n.get('houseLeaderName')} *',
                hint: l10n.get('houseLeaderNameHint'),
                prefixIcon: const Icon(Icons.person_outline),
                enabled: isOnline && !_isSaving,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return l10n.get('pleaseEnterLeaderName');
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _addressCtrl,
                label: l10n.get('address'),
                hint: l10n.get('optionalStreetAddressHint'),
                prefixIcon: const Icon(Icons.location_on_outlined),
                enabled: isOnline && !_isSaving,
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _villageNameCtrl,
                label: l10n.get('village'),
                hint: l10n.get('villageHint'),
                prefixIcon: const Icon(Icons.map_outlined),
                enabled: isOnline && !_isSaving,
              ),
              const SizedBox(height: GrsSpacing.lg),
              Text(
                l10n.get('welfarePrograms'),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: GrsSpacing.xs),
              CheckboxListTile(
                title: Text(l10n.get('epf')),
                value: _isEpf,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isEpf = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: Text(l10n.get('etf')),
                value: _isEtf,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isEtf = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: Text(l10n.get('aswesuma')),
                value: _isAswesuma,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isAswesuma = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: Text(l10n.get('samurdhi')),
                value: _isSamurdhi,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _isSamurdhi = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              CheckboxListTile(
                title: Text(l10n.get('specialNeeds')),
                value: _hasSpecialNeeds,
                onChanged: isOnline && !_isSaving
                    ? (v) => setState(() => _hasSpecialNeeds = v ?? false)
                    : null,
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: GrsSpacing.lg),
              Text(
                l10n.get('targetDemographics'),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: GrsSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: GrsTextField(
                      controller: _targetFemaleCtrl,
                      label: l10n.get('female'),
                      hint: '0',
                      prefixIcon: const Icon(Icons.woman),
                      keyboardType: TextInputType.number,
                      enabled: isOnline && !_isSaving,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return null;
                        final parsed = int.tryParse(val.trim());
                        if (parsed == null || parsed < 0) {
                          return 'Enter valid count';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: GrsSpacing.md),
                  Expanded(
                    child: GrsTextField(
                      controller: _targetMaleCtrl,
                      label: l10n.get('male'),
                      hint: '0',
                      prefixIcon: const Icon(Icons.man),
                      keyboardType: TextInputType.number,
                      enabled: isOnline && !_isSaving,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return null;
                        final parsed = int.tryParse(val.trim());
                        if (parsed == null || parsed < 0) {
                          return 'Enter valid count';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: GrsSpacing.md),
              GrsTextField(
                controller: _ageGroupCtrl,
                label: l10n.get('ageGroup'),
                hint: l10n.get('ageGroupHint'),
                prefixIcon: const Icon(Icons.calendar_month_outlined),
                enabled: isOnline && !_isSaving,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return null;
                  final parts = val.trim().split('-');
                  if (parts.length != 2) {
                    return 'Format must be e.g. 18-35';
                  }
                  final min = int.tryParse(parts[0].trim());
                  final max = int.tryParse(parts[1].trim());
                  if (min == null || max == null) {
                    return 'Please enter valid numbers';
                  }
                  if (min < 0 || max < 0) {
                    return 'Age cannot be negative';
                  }
                  if (min >= max) {
                    return 'Minimum age must be less than maximum age';
                  }
                  return null;
                },
              ),
              const SizedBox(height: GrsSpacing.lg),
              Text(
                l10n.get('preferredLanguage'),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Wrap(
                spacing: GrsSpacing.sm,
                children: [
                  FilterChip(
                    label: Text(l10n.get('sinhalaOption')),
                    selected: _langSinhala,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langSinhala = s)
                        : null,
                  ),
                  FilterChip(
                    label: Text(l10n.get('tamilOption')),
                    selected: _langTamil,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langTamil = s)
                        : null,
                  ),
                  FilterChip(
                    label: Text(l10n.get('englishOption')),
                    selected: _langEnglish,
                    onSelected: isOnline && !_isSaving
                        ? (s) => setState(() => _langEnglish = s)
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: GrsSpacing.xl),
              GrsButton(
                label: _isSaving ? '...' : l10n.get('createHouse'),
                onPressed: isOnline && !_isSaving ? _submitHouse : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
