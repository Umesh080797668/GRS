import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import 'package:uuid/uuid.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';

class ClientFormScreen extends ConsumerStatefulWidget {
  final String houseId;
  final String? clientId;
  final bool consentGiven;

  const ClientFormScreen({
    super.key,
    required this.houseId,
    this.clientId,
    this.consentGiven = false,
  });

  @override
  ConsumerState<ClientFormScreen> createState() => _ClientFormScreenState();
}

class _ClientFormScreenState extends ConsumerState<ClientFormScreen> {
  final _formKey = GlobalKey<FormState>();

  // Form Fields (10.1 - 10.13)
  final _nameController = TextEditingController();
  final _ageController = TextEditingController();
  String _gender = 'F';
  final _addressController = TextEditingController();
  final _phoneController = TextEditingController();
  final _whatsappController = TextEditingController();
  String? _highestEducation;
  String? _highestVocational;
  String? _interestedVocationalStream;
  String? _interestedJob;
  bool _isEpf = false;
  bool _isEtf = false;
  bool _isAswesuma = false;
  bool _isSamurdhi = false;
  bool _hasSpecialNeeds = false;
  final Set<String> _futureHopes = {};
  String _infoProvidedBy = 'self';
  final _infoOtherController = TextEditingController();

  bool _isLocked = false;
  bool _isDraft = true;
  bool _isConsentConfirmed = false;
  bool _isLoading = true;
  Map<String, dynamic>? _household;

  @override
  void initState() {
    super.initState();
    _isConsentConfirmed = widget.consentGiven;
    _loadInitialData();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ageController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    _whatsappController.dispose();
    _infoOtherController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialData() async {
    final db = await ref.read(databaseProvider.future);
    final house = await db.getHouseholdById(widget.houseId);
    _household = house;

    if (widget.clientId != null) {
      final client = await db.getClientById(widget.clientId!);
      if (client != null) {
        _nameController.text = client['name'] as String;
        _ageController.text = (client['age'] as int).toString();
        _gender = client['gender'] as String;
        _addressController.text = client['address'] as String? ?? '';
        _phoneController.text = client['phone_raw'] as String? ?? '';
        _whatsappController.text = client['whatsapp_raw'] as String? ?? '';
        _highestEducation = client['highest_education'] as String?;
        _highestVocational = client['highest_vocational'] as String?;
        _interestedVocationalStream =
            client['interested_vocational_stream'] as String?;
        _interestedJob = client['interested_job'] as String?;
        _isEpf = (client['is_epf'] as int) == 1;
        _isEtf = (client['is_etf'] as int) == 1;
        _isAswesuma = (client['is_aswesuma'] as int) == 1;
        _isSamurdhi = (client['is_samurdhi'] as int) == 1;
        _hasSpecialNeeds = (client['has_special_needs'] as int) == 1;

        final hopesList =
            jsonDecode(client['future_hopes'] as String) as List<dynamic>;
        _futureHopes.addAll(hopesList.map((e) => e.toString()));

        _infoProvidedBy = client['info_provided_by'] as String;
        _infoOtherController.text =
            client['info_provided_by_other'] as String? ?? '';
        _isConsentConfirmed = (client['consent_given'] as int) == 1;

        final syncStatus = client['sync_status'] as String;
        _isDraft = syncStatus == 'draft';
        _isLocked = syncStatus == 'synced'; // Decision C2: locked for Level 5
      }
    } else {
      // New Client: Pre-fill address from household
      if (house != null && house['address'] != null) {
        _addressController.text = house['address'] as String;
      }
    }

    if (mounted) setState(() => _isLoading = false);
  }

  Future<bool> _saveRecord({required SyncStatus status}) async {
    // If not draft, validate form and consent strictly
    if (status != SyncStatus.draft) {
      if (!_isConsentConfirmed) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Cannot save without informed consent.'),
          ),
        );
        return false;
      }

      if (!(_formKey.currentState?.validate() ?? false)) {
        return false;
      }
    }

    final db = await ref.read(databaseProvider.future);
    final id = widget.clientId ?? const Uuid().v4();
    final now = DateTime.now().toUtc();

    // Normalizations
    final phoneNorm = GrsValidators.normalizePhone(_phoneController.text);
    final waNorm = GrsValidators.normalizeWhatsApp(_whatsappController.text);

    final client = Client(
      id: id,
      householdId: widget.houseId,
      name: _nameController.text.trim().isEmpty
          ? 'Draft Beneficiary'
          : _nameController.text.trim(),
      age: int.tryParse(_ageController.text) ?? 18,
      gender: _gender,
      address: _addressController.text.trim(),
      phoneRaw: _phoneController.text.trim().isEmpty
          ? null
          : _phoneController.text.trim(),
      phoneE164: phoneNorm.isValid ? phoneNorm.value : null,
      whatsappRaw: _whatsappController.text.trim().isEmpty
          ? null
          : _whatsappController.text.trim(),
      whatsappE164: waNorm.isValid ? waNorm.value : null,
      highestEducation: _highestEducation,
      highestVocational: _highestVocational,
      interestedVocationalStream: _interestedVocationalStream,
      interestedJob: _interestedJob,
      isEpf: _isEpf,
      isEtf: _isEtf,
      isAswesuma: _isAswesuma,
      isSamurdhi: _isSamurdhi,
      hasSpecialNeeds: _hasSpecialNeeds,
      futureHopes: _futureHopes.toList(),
      infoProvidedBy: _infoProvidedBy,
      infoProvidedByOther: _infoProvidedBy == 'other'
          ? _infoOtherController.text.trim()
          : null,
      consentGiven: _isConsentConfirmed,
      consentAt: _isConsentConfirmed ? now : null,
      createdAt: now,
      updatedAt: now,
    );

    await db.saveClient(client: client, status: status);
    return true;
  }

  Future<void> _handleDeleteDraft() async {
    if (widget.clientId == null) return;
    final db = await ref.read(databaseProvider.future);
    await db.deleteDraftClient(widget.clientId!);
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);

    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final houseNo = _household?['house_no'] as String? ?? 'N/A';
    final leader = _household?['house_leader_name'] as String? ?? 'N/A';

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('clientFormTitle'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Locked Record Banner (Decision C2)
              if (_isLocked) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: GrsColors.syncSyncedBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: GrsColors.syncSynced),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock_rounded, color: GrsColors.syncSynced),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Locked: This record has been confirmed by the server and cannot be edited by Level 5 agents.',
                          style: TextStyle(
                            color: GrsColors.syncSynced,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Auto-filled Household Headers
              GrsCard(
                child: Row(
                  children: [
                    Expanded(
                      child: GrsReadOnlyBadge(
                        label: l10n.get('houseNumber'),
                        value: houseNo,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: GrsReadOnlyBadge(
                        label: l10n.get('houseLeader'),
                        value: leader,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // 10.1 & 10.2: Name and Age
              Text(
                l10n.get('personalInfo'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(height: 16),

              GrsTextField(
                controller: _nameController,
                label: l10n.get('nameLabel'),
                hint: l10n.get('nameHint'),
                enabled: !_isLocked,
                validator: (val) {
                  final res = GrsValidators.validateName(val);
                  return res.isValid ? null : res.error;
                },
              ),
              const SizedBox(height: 16),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 2,
                    child: GrsTextField(
                      controller: _ageController,
                      label: l10n.get('ageLabel'),
                      hint: l10n.get('ageHint'),
                      keyboardType: TextInputType.number,
                      enabled: !_isLocked,
                      validator: (val) {
                        final res = GrsValidators.validateAge(
                          int.tryParse(val ?? ''),
                        );
                        return res.isValid ? null : res.error;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    flex: 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.get('genderLabel'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            ChoiceChip(
                              label: Text(l10n.get('genderFemale')),
                              selected: _gender == 'F',
                              onSelected: _isLocked
                                  ? null
                                  : (s) => setState(() => _gender = 'F'),
                            ),
                            ChoiceChip(
                              label: Text(l10n.get('genderMale')),
                              selected: _gender == 'M',
                              onSelected: _isLocked
                                  ? null
                                  : (s) => setState(() => _gender = 'M'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // 10.3: Address
              GrsTextField(
                controller: _addressController,
                label: l10n.get('clientAddressLabel'),
                enabled: !_isLocked,
              ),
              const SizedBox(height: 16),

              // 10.4 & 10.5: Phones
              Row(
                children: [
                  Expanded(
                    child: GrsTextField(
                      controller: _phoneController,
                      label: l10n.get('phoneLabel'),
                      hint: l10n.get('phoneHint'),
                      keyboardType: TextInputType.phone,
                      enabled: !_isLocked,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GrsTextField(
                      controller: _whatsappController,
                      label: l10n.get('whatsappLabel'),
                      hint: l10n.get('whatsappHint'),
                      keyboardType: TextInputType.phone,
                      enabled: !_isLocked,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // 10.6 - 10.9: Qualifications & Interests
              Text(
                l10n.get('qualificationsTitle'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(height: 16),

              GrsDropdown<String>(
                label: l10n.get('highestEducationLabel'),
                value: _highestEducation,
                enabled: !_isLocked,
                items: const [
                  GrsDropdownItem(
                    value: 'no_formal',
                    label: 'No Formal Education',
                  ),
                  GrsDropdownItem(
                    value: 'primary',
                    label: 'Primary (Grades 1-5)',
                  ),
                  GrsDropdownItem(
                    value: 'secondary',
                    label: 'Secondary (Grades 6-10)',
                  ),
                  GrsDropdownItem(
                    value: 'ol_passed',
                    label: 'G.C.E. O/L Passed',
                  ),
                  GrsDropdownItem(
                    value: 'al_passed',
                    label: 'G.C.E. A/L Passed',
                  ),
                  GrsDropdownItem(
                    value: 'diploma',
                    label: 'Diploma / Higher Diploma',
                  ),
                  GrsDropdownItem(
                    value: 'degree',
                    label: 'Bachelor Degree or Above',
                  ),
                ],
                onChanged: (val) => setState(() => _highestEducation = val),
              ),
              const SizedBox(height: 16),

              GrsDropdown<String>(
                label: l10n.get('highestVocationalLabel'),
                value: _highestVocational,
                enabled: !_isLocked,
                items: const [
                  GrsDropdownItem(value: 'none', label: 'None'),
                  GrsDropdownItem(value: 'nvq_1_3', label: 'NVQ Level 1-3'),
                  GrsDropdownItem(value: 'nvq_4', label: 'NVQ Level 4'),
                  GrsDropdownItem(
                    value: 'nvq_5_6',
                    label: 'NVQ Level 5-6 (Diploma)',
                  ),
                  GrsDropdownItem(
                    value: 'nvq_7',
                    label: 'NVQ Level 7 (Degree)',
                  ),
                  GrsDropdownItem(
                    value: 'other_cert',
                    label: 'Other Vocational Certificate',
                  ),
                ],
                onChanged: (val) => setState(() => _highestVocational = val),
              ),
              const SizedBox(height: 16),

              GrsDropdown<String>(
                label: l10n.get('interestedVocationalStreamLabel'),
                value: _interestedVocationalStream,
                enabled: !_isLocked,
                items: const [
                  GrsDropdownItem(
                    value: 'information_technology',
                    label: 'Information Technology & AI',
                  ),
                  GrsDropdownItem(
                    value: 'electrical_electronics',
                    label: 'Electrical & Electronics',
                  ),
                  GrsDropdownItem(
                    value: 'automotive_mechanical',
                    label: 'Automotive & Mechanical',
                  ),
                  GrsDropdownItem(
                    value: 'construction_building',
                    label: 'Construction & Carpentry',
                  ),
                  GrsDropdownItem(
                    value: 'hospitality_tourism',
                    label: 'Hospitality & Culinary Arts',
                  ),
                  GrsDropdownItem(
                    value: 'agriculture_farming',
                    label: 'Agriculture & Food Processing',
                  ),
                  GrsDropdownItem(
                    value: 'healthcare_nursing',
                    label: 'Healthcare & Nursing Assistance',
                  ),
                  GrsDropdownItem(
                    value: 'apparel_textile',
                    label: 'Textile & Apparel Design',
                  ),
                ],
                onChanged: (val) =>
                    setState(() => _interestedVocationalStream = val),
              ),
              const SizedBox(height: 16),

              GrsDropdown<String>(
                label: l10n.get('interestedJobLabel'),
                value: _interestedJob,
                enabled: !_isLocked,
                items: const [
                  GrsDropdownItem(
                    value: 'software_technician',
                    label: 'Software / Network Technician',
                  ),
                  GrsDropdownItem(
                    value: 'electrician',
                    label: 'Industrial Electrician',
                  ),
                  GrsDropdownItem(
                    value: 'mechanic',
                    label: 'Motor Vehicle Mechanic',
                  ),
                  GrsDropdownItem(
                    value: 'chef_steward',
                    label: 'Hotel Chef / Steward',
                  ),
                  GrsDropdownItem(
                    value: 'plumber',
                    label: 'Plumbing & Pipefitting',
                  ),
                  GrsDropdownItem(
                    value: 'tailor_fashion',
                    label: 'Garment Machine Operator',
                  ),
                  GrsDropdownItem(
                    value: 'caregiver',
                    label: 'Caregiver / Nursing Aide',
                  ),
                  GrsDropdownItem(
                    value: 'entrepreneur_own',
                    label: 'Self-Employed Entrepreneur',
                  ),
                ],
                onChanged: (val) => setState(() => _interestedJob = val),
              ),
              const SizedBox(height: 24),

              // 10.10 & 10.11: Welfare & Special Needs
              Text(
                l10n.get('welfareTitle'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(height: 16),

              CheckboxListTile(
                value: _isEpf,
                title: Text(l10n.get('isEpf')),
                onChanged: _isLocked
                    ? null
                    : (v) => setState(() => _isEpf = v ?? false),
              ),
              CheckboxListTile(
                value: _isEtf,
                title: Text(l10n.get('isEtf')),
                onChanged: _isLocked
                    ? null
                    : (v) => setState(() => _isEtf = v ?? false),
              ),
              CheckboxListTile(
                value: _isAswesuma,
                title: Text(l10n.get('isAswesuma')),
                onChanged: _isLocked
                    ? null
                    : (v) => setState(() => _isAswesuma = v ?? false),
              ),
              CheckboxListTile(
                value: _isSamurdhi,
                title: Text(l10n.get('isSamurdhi')),
                onChanged: _isLocked
                    ? null
                    : (v) => setState(() => _isSamurdhi = v ?? false),
              ),
              CheckboxListTile(
                value: _hasSpecialNeeds,
                title: Text(l10n.get('hasSpecialNeeds')),
                onChanged: _isLocked
                    ? null
                    : (v) => setState(() => _hasSpecialNeeds = v ?? false),
              ),
              const SizedBox(height: 24),

              // 10.12: Future Hopes Multi-select
              Text(
                l10n.get('futureHopesTitle'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildHopeChip('higher_education', 'Higher Education'),
                  _buildHopeChip('vocational_education', 'Vocational Training'),
                  _buildHopeChip(
                    'entrepreneur',
                    'Start Business / Entrepreneur',
                  ),
                  _buildHopeChip('local_job', 'Local Employment'),
                  _buildHopeChip('foreign_job', 'Foreign Employment'),
                ],
              ),
              const SizedBox(height: 24),

              // 10.13: Info Provided By
              Text(
                l10n.get('infoSourceTitle'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(height: 16),

              GrsDropdown<String>(
                label: l10n.get('infoProvidedByLabel'),
                value: _infoProvidedBy,
                enabled: !_isLocked,
                items: const [
                  GrsDropdownItem(
                    value: 'self',
                    label: 'Self (ප්‍රතිලාභියා විසින්ම)',
                  ),
                  GrsDropdownItem(value: 'mother', label: 'Mother (මව)'),
                  GrsDropdownItem(value: 'father', label: 'Father (පියා)'),
                  GrsDropdownItem(
                    value: 'sister',
                    label: 'Sister / Brother (සහෝදරයා / සහෝදරිය)',
                  ),
                  GrsDropdownItem(
                    value: 'other',
                    label: 'Other (වෙනත් ඥාතියෙකු)',
                  ),
                ],
                onChanged: (val) =>
                    setState(() => _infoProvidedBy = val ?? 'self'),
              ),
              if (_infoProvidedBy == 'other') ...[
                const SizedBox(height: 12),
                GrsTextField(
                  controller: _infoOtherController,
                  label: l10n.get('infoProvidedByOtherLabel'),
                  enabled: !_isLocked,
                ),
              ],
              const SizedBox(height: 32),

              // Action Buttons
              if (!_isLocked) ...[
                GrsButton(
                  text: l10n.get('saveAndNextButton'),
                  onPressed: () async {
                    final ok = await _saveRecord(status: SyncStatus.pending);
                    if (ok && context.mounted) {
                      context.pushReplacement(
                        '/houses/${widget.houseId}/client/new?consent=true',
                      );
                    }
                  },
                ),
                const SizedBox(height: 12),
                GrsButton(
                  text: l10n.get('saveAndFinishButton'),
                  variant: GrsButtonVariant.secondary,
                  onPressed: () async {
                    final ok = await _saveRecord(status: SyncStatus.pending);
                    if (ok && context.mounted) {
                      Navigator.of(context).maybePop();
                    }
                  },
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () async {
                    final ok = await _saveRecord(status: SyncStatus.draft);
                    if (ok && context.mounted) {
                      Navigator.of(context).maybePop();
                    }
                  },
                  child: Text(l10n.get('saveDraftButton')),
                ),
                if (_isDraft && widget.clientId != null) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    icon: const Icon(
                      Icons.delete_outline,
                      color: GrsColors.syncRejected,
                    ),
                    label: Text(
                      l10n.get('delete'),
                      style: const TextStyle(color: GrsColors.syncRejected),
                    ),
                    onPressed: _handleDeleteDraft,
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHopeChip(String code, String label) {
    final isSelected = _futureHopes.contains(code);
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: _isLocked
          ? null
          : (selected) {
              setState(() {
                if (selected) {
                  _futureHopes.add(code);
                } else {
                  _futureHopes.remove(code);
                }
              });
            },
    );
  }
}
