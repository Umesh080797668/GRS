import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import 'package:uuid/uuid.dart';
import '../../l10n/l10n.dart';
import '../../providers/database_provider.dart';
import '../../providers/sync_provider.dart';

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

  // ── Form fields (10.1–10.13) ───────────────────────────────────────────────
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
        _isLocked = syncStatus == 'synced';
      }
    } else {
      // Pre-fill address from household
      if (house != null && house['address'] != null) {
        _addressController.text = house['address'] as String;
      }
    }

    if (mounted) setState(() => _isLoading = false);
  }

  Future<bool> _saveRecord({required SyncStatus status}) async {
    if (status != SyncStatus.draft) {
      if (!_isConsentConfirmed) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Cannot save without informed consent.'),
          ),
        );
        return false;
      }
      if (!(_formKey.currentState?.validate() ?? false)) return false;
    }

    final db = await ref.read(databaseProvider.future);
    final id = widget.clientId ?? const Uuid().v4();
    final now = DateTime.now().toUtc();

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
    ref.read(recordsRevisionProvider.notifier).increment();
    return true;
  }

  Future<void> _handleDeleteDraft() async {
    if (widget.clientId == null) return;
    final db = await ref.read(databaseProvider.future);
    await db.deleteDraftClient(widget.clientId!);
    ref.read(recordsRevisionProvider.notifier).increment();
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);

    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final houseNo = _household?['house_no'] as String? ?? 'N/A';
    final leader = _household?['house_leader_name'] as String? ?? 'N/A';

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('clientFormTitle')),
        actions: [
          // Locked state indicator in app bar
          if (_isLocked)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: isDark
                      ? GrsColors.syncSyncedBgDark
                      : GrsColors.syncSyncedBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.lock_rounded,
                      size: 13,
                      color: GrsColors.syncSynced,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Locked',
                      style: GrsTypography.labelSmall(
                        color: GrsColors.syncSynced,
                      ).copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          // ── Locked banner ──────────────────────────────────────────────────
          if (_isLocked)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: isDark
                  ? GrsColors.syncSyncedBgDark
                  : GrsColors.syncSyncedBg,
              child: Row(
                children: [
                  const Icon(
                    Icons.lock_rounded,
                    size: 16,
                    color: GrsColors.syncSynced,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Locked: This record has been confirmed and synced to central database. Editing is disabled.',
                      style: GrsTypography.labelSmall(
                        color: GrsColors.syncSynced,
                      ).copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

          // ── Form body ──────────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                GrsSpacing.pagePad,
                12,
                GrsSpacing.pagePad,
                32,
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Household context card ───────────────────────────────
                    GrsFadeSlideItem(
                      index: 0,
                      child: GrsCard(
                        padding: const EdgeInsets.all(14),
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
                    ),

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Section: Personal Info ───────────────────────────────
                    GrsFadeSlideItem(
                      index: 1,
                      child: _SectionHeader(
                        icon: Icons.person_outline_rounded,
                        title: l10n.get('personalInfo'),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 2,
                      child: GrsTextField(
                        controller: _nameController,
                        label: l10n.get('nameLabel'),
                        hint: l10n.get('nameHint'),
                        prefixIcon: const Icon(Icons.badge_outlined, size: 20),
                        enabled: !_isLocked,
                        validator: (val) {
                          final res = GrsValidators.validateName(val);
                          return res.isValid ? null : res.error;
                        },
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Age + Gender row
                    GrsFadeSlideItem(
                      index: 3,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            flex: 2,
                            child: GrsTextField(
                              controller: _ageController,
                              label: l10n.get('ageLabel'),
                              hint: l10n.get('ageHint'),
                              keyboardType: TextInputType.number,
                              prefixIcon: const Icon(
                                Icons.cake_outlined,
                                size: 20,
                              ),
                              enabled: !_isLocked,
                              validator: (val) {
                                final res = GrsValidators.validateAge(
                                  int.tryParse(val ?? ''),
                                );
                                return res.isValid ? null : res.error;
                              },
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            flex: 3,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l10n.get('genderLabel'),
                                  style: GrsTypography.labelMedium(
                                    color: isDark
                                        ? GrsColors.textSecondaryDark
                                        : GrsColors.textSecondaryLight,
                                  ).copyWith(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 6),
                                _GenderSelector(
                                  selected: _gender,
                                  enabled: !_isLocked,
                                  femaleLabel: l10n.get('genderFemale'),
                                  maleLabel: l10n.get('genderMale'),
                                  onChanged: (v) => setState(() => _gender = v),
                                  isDark: isDark,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Address
                    GrsFadeSlideItem(
                      index: 4,
                      child: GrsTextField(
                        controller: _addressController,
                        label: l10n.get('clientAddressLabel'),
                        prefixIcon: const Icon(
                          Icons.location_on_outlined,
                          size: 20,
                        ),
                        enabled: !_isLocked,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    // Phone + WhatsApp
                    GrsFadeSlideItem(
                      index: 5,
                      child: Row(
                        children: [
                          Expanded(
                            child: GrsTextField(
                              controller: _phoneController,
                              label: l10n.get('phoneLabel'),
                              hint: l10n.get('phoneHint'),
                              keyboardType: TextInputType.phone,
                              prefixIcon: const Icon(
                                Icons.phone_outlined,
                                size: 20,
                              ),
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
                              prefixIcon: const Icon(
                                Icons.chat_bubble_outline_rounded,
                                size: 20,
                              ),
                              enabled: !_isLocked,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Section: Qualifications ──────────────────────────────
                    GrsFadeSlideItem(
                      index: 6,
                      child: _SectionHeader(
                        icon: Icons.school_outlined,
                        title: l10n.get('qualificationsTitle'),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 7,
                      child: GrsDropdown<String>(
                        label: l10n.get('highestEducationLabel'),
                        value: _highestEducation,
                        enabled: !_isLocked,
                        hint: 'Select level',
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
                        onChanged: (val) =>
                            setState(() => _highestEducation = val),
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 8,
                      child: GrsDropdown<String>(
                        label: l10n.get('highestVocationalLabel'),
                        value: _highestVocational,
                        enabled: !_isLocked,
                        hint: 'Select level',
                        items: const [
                          GrsDropdownItem(value: 'none', label: 'None'),
                          GrsDropdownItem(
                            value: 'nvq_1_3',
                            label: 'NVQ Level 1-3',
                          ),
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
                        onChanged: (val) =>
                            setState(() => _highestVocational = val),
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 9,
                      child: GrsDropdown<String>(
                        label: l10n.get('interestedVocationalStreamLabel'),
                        value: _interestedVocationalStream,
                        enabled: !_isLocked,
                        hint: 'Select stream',
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
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 10,
                      child: GrsDropdown<String>(
                        label: l10n.get('interestedJobLabel'),
                        value: _interestedJob,
                        enabled: !_isLocked,
                        hint: 'Select role',
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
                        onChanged: (val) =>
                            setState(() => _interestedJob = val),
                      ),
                    ),

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Section: Welfare & Special Needs ─────────────────────
                    GrsFadeSlideItem(
                      index: 11,
                      child: _SectionHeader(
                        icon: Icons.favorite_border_rounded,
                        title: l10n.get('welfareTitle'),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 12,
                      child: GrsCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            _CheckRow(
                              value: _isEpf,
                              label: l10n.get('isEpf'),
                              enabled: !_isLocked,
                              onChanged: (v) =>
                                  setState(() => _isEpf = v ?? false),
                              isDark: isDark,
                            ),
                            _Divider(isDark: isDark),
                            _CheckRow(
                              value: _isEtf,
                              label: l10n.get('isEtf'),
                              enabled: !_isLocked,
                              onChanged: (v) =>
                                  setState(() => _isEtf = v ?? false),
                              isDark: isDark,
                            ),
                            _Divider(isDark: isDark),
                            _CheckRow(
                              value: _isAswesuma,
                              label: l10n.get('isAswesuma'),
                              enabled: !_isLocked,
                              onChanged: (v) =>
                                  setState(() => _isAswesuma = v ?? false),
                              isDark: isDark,
                            ),
                            _Divider(isDark: isDark),
                            _CheckRow(
                              value: _isSamurdhi,
                              label: l10n.get('isSamurdhi'),
                              enabled: !_isLocked,
                              onChanged: (v) =>
                                  setState(() => _isSamurdhi = v ?? false),
                              isDark: isDark,
                            ),
                            _Divider(isDark: isDark),
                            _CheckRow(
                              value: _hasSpecialNeeds,
                              label: l10n.get('hasSpecialNeeds'),
                              enabled: !_isLocked,
                              isAlert: true,
                              onChanged: (v) =>
                                  setState(() => _hasSpecialNeeds = v ?? false),
                              isDark: isDark,
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Section: Future Hopes ─────────────────────────────────
                    GrsFadeSlideItem(
                      index: 13,
                      child: _SectionHeader(
                        icon: Icons.lightbulb_outline_rounded,
                        title: l10n.get('futureHopesTitle'),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 14,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _buildHopeChip(
                            'higher_education',
                            'Higher Education',
                            isDark: isDark,
                          ),
                          _buildHopeChip(
                            'vocational_education',
                            'Vocational Training',
                            isDark: isDark,
                          ),
                          _buildHopeChip(
                            'entrepreneur',
                            'Start Business / Entrepreneur',
                            isDark: isDark,
                          ),
                          _buildHopeChip(
                            'local_job',
                            'Local Employment',
                            isDark: isDark,
                          ),
                          _buildHopeChip(
                            'foreign_job',
                            'Foreign Employment',
                            isDark: isDark,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Section: Info Source ──────────────────────────────────
                    GrsFadeSlideItem(
                      index: 15,
                      child: _SectionHeader(
                        icon: Icons.record_voice_over_outlined,
                        title: l10n.get('infoSourceTitle'),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(height: GrsSpacing.md),

                    GrsFadeSlideItem(
                      index: 16,
                      child: GrsDropdown<String>(
                        label: l10n.get('infoProvidedByLabel'),
                        value: _infoProvidedBy,
                        enabled: !_isLocked,
                        items: const [
                          GrsDropdownItem(
                            value: 'self',
                            label: 'Self (ප්‍රතිලාභියා විසින්ම)',
                          ),
                          GrsDropdownItem(
                            value: 'mother',
                            label: 'Mother (මව)',
                          ),
                          GrsDropdownItem(
                            value: 'father',
                            label: 'Father (පියා)',
                          ),
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
                    ),

                    if (_infoProvidedBy == 'other') ...[
                      const SizedBox(height: GrsSpacing.md),
                      GrsFadeIn(
                        child: GrsTextField(
                          controller: _infoOtherController,
                          label: l10n.get('infoProvidedByOtherLabel'),
                          enabled: !_isLocked,
                        ),
                      ),
                    ],

                    const SizedBox(height: GrsSpacing.sectionGap),

                    // ── Action buttons ────────────────────────────────────────
                    if (!_isLocked) ...[
                      GrsFadeSlideItem(
                        index: 17,
                        child: GrsButton(
                          label: l10n.get('saveAndNextButton'),
                          icon: Icons.arrow_forward_rounded,
                          isFullWidth: true,
                          size: GrsButtonSize.large,
                          onPressed: () async {
                            final ok = await _saveRecord(
                              status: SyncStatus.pending,
                            );
                            if (ok && context.mounted) {
                              context.pushReplacement(
                                '/houses/${widget.houseId}/client/new?consent=true',
                              );
                            }
                          },
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.xs),

                      GrsFadeSlideItem(
                        index: 18,
                        child: GrsButton(
                          label: l10n.get('saveAndFinishButton'),
                          icon: Icons.check_circle_outline_rounded,
                          variant: GrsButtonVariant.secondary,
                          isFullWidth: true,
                          onPressed: () async {
                            final ok = await _saveRecord(
                              status: SyncStatus.pending,
                            );
                            if (ok && context.mounted) {
                              Navigator.of(context).maybePop();
                            }
                          },
                        ),
                      ),
                      const SizedBox(height: GrsSpacing.xs),

                      GrsFadeSlideItem(
                        index: 19,
                        child: GrsButton(
                          label: l10n.get('saveDraftButton'),
                          icon: Icons.save_outlined,
                          variant: GrsButtonVariant.outline,
                          isFullWidth: true,
                          onPressed: () async {
                            final ok = await _saveRecord(
                              status: SyncStatus.draft,
                            );
                            if (ok && context.mounted) {
                              Navigator.of(context).maybePop();
                            }
                          },
                        ),
                      ),

                      if (_isDraft && widget.clientId != null) ...[
                        const SizedBox(height: GrsSpacing.xs),
                        GrsFadeSlideItem(
                          index: 20,
                          child: GrsButton(
                            label: l10n.get('delete'),
                            icon: Icons.delete_outline_rounded,
                            variant: GrsButtonVariant.danger,
                            isFullWidth: true,
                            onPressed: _handleDeleteDraft,
                          ),
                        ),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHopeChip(String code, String label, {required bool isDark}) {
    final isSelected = _futureHopes.contains(code);
    final selectedBg = isDark
        ? GrsColors.primaryContainerDark
        : GrsColors.primaryContainerLight;
    final selectedInk = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;
    final unselectedBg = isDark
        ? GrsColors.surfaceVariantDark
        : GrsColors.surfaceVariantLight;
    final unselectedInk = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return GrsBounceTouch(
      onTap: _isLocked
          ? null
          : () {
              setState(() {
                if (isSelected) {
                  _futureHopes.remove(code);
                } else {
                  _futureHopes.add(code);
                }
              });
            },
      haptic: false,
      child: AnimatedContainer(
        duration: GrsMotion.durationFast,
        curve: GrsMotion.curveEnter,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: isSelected ? selectedBg : unselectedBg,
          borderRadius: BorderRadius.circular(8),
          border: isSelected
              ? Border.all(
                  color: isDark
                      ? GrsColors.primaryDark
                      : GrsColors.primaryLight,
                  width: 1.5,
                )
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isSelected) ...[
              Icon(Icons.check_rounded, size: 14, color: selectedInk),
              const SizedBox(width: 5),
            ],
            Flexible(
              child: Text(
                label,
                style:
                    GrsTypography.labelMedium(
                      color: isSelected ? selectedInk : unselectedInk,
                    ).copyWith(
                      fontWeight: isSelected
                          ? FontWeight.w700
                          : FontWeight.w500,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ────────────────────────────────────────────────────────────────────────────

/// Section header with icon, title, and a one-tone-step separator line.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.isDark,
  });
  final IconData icon;
  final String title;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: isDark
                ? GrsColors.primaryContainerDark
                : GrsColors.primaryContainerLight,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 18, color: primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GrsTypography.headlineMedium(
                  color: ink,
                ).copyWith(fontSize: 16),
              ),
              const SizedBox(height: 4),
              Container(
                height: 1,
                color: isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Gender selector — two pill buttons with animated toggle.
class _GenderSelector extends StatelessWidget {
  const _GenderSelector({
    required this.selected,
    required this.enabled,
    required this.femaleLabel,
    required this.maleLabel,
    required this.onChanged,
    required this.isDark,
  });
  final String selected;
  final bool enabled;
  final String femaleLabel;
  final String maleLabel;
  final ValueChanged<String> onChanged;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _GenderPill(
          label: femaleLabel,
          value: 'F',
          selected: selected == 'F',
          enabled: enabled,
          onTap: () => onChanged('F'),
          isDark: isDark,
          accentColor: const Color(0xFF9333EA),
          accentBg: isDark ? const Color(0xFF2D1B45) : const Color(0xFFF3E8FF),
        ),
        const SizedBox(width: 8),
        _GenderPill(
          label: maleLabel,
          value: 'M',
          selected: selected == 'M',
          enabled: enabled,
          onTap: () => onChanged('M'),
          isDark: isDark,
          accentColor: isDark ? GrsColors.primaryDark : GrsColors.primaryLight,
          accentBg: isDark
              ? GrsColors.primaryContainerDark
              : GrsColors.primaryContainerLight,
        ),
      ],
    );
  }
}

class _GenderPill extends StatelessWidget {
  const _GenderPill({
    required this.label,
    required this.value,
    required this.selected,
    required this.enabled,
    required this.onTap,
    required this.isDark,
    required this.accentColor,
    required this.accentBg,
  });
  final String label;
  final String value;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final bool isDark;
  final Color accentColor;
  final Color accentBg;

  @override
  Widget build(BuildContext context) {
    final unselBg = isDark
        ? GrsColors.surfaceVariantDark
        : GrsColors.surfaceVariantLight;
    final unselInk = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return GrsBounceTouch(
      onTap: enabled ? onTap : null,
      haptic: false,
      child: AnimatedContainer(
        duration: GrsMotion.durationFast,
        curve: GrsMotion.curveEnter,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? accentBg : unselBg,
          borderRadius: BorderRadius.circular(8),
          border: selected ? Border.all(color: accentColor, width: 1.5) : null,
        ),
        child: Text(
          label,
          style: GrsTypography.labelMedium(
            color: selected ? accentColor : unselInk,
          ).copyWith(fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
        ),
      ),
    );
  }
}

/// Checkbox row inside a GrsCard with proper touch target and alignment.
class _CheckRow extends StatelessWidget {
  const _CheckRow({
    required this.value,
    required this.label,
    required this.enabled,
    required this.onChanged,
    required this.isDark,
    this.isAlert = false,
  });
  final bool value;
  final String label;
  final bool enabled;
  final ValueChanged<bool?> onChanged;
  final bool isDark;
  final bool isAlert;

  @override
  Widget build(BuildContext context) {
    final labelColor = isAlert && value
        ? GrsColors.duplicateAlert
        : (isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight);
    final checkColor = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return InkWell(
      onTap: enabled ? () => onChanged(!value) : null,
      borderRadius: BorderRadius.circular(0),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: GrsTypography.bodyLarge(color: labelColor).copyWith(
                  fontSize: 14,
                  fontWeight: value ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            AnimatedContainer(
              duration: GrsMotion.durationFast,
              curve: GrsMotion.curveEnter,
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: value
                    ? (isAlert ? GrsColors.duplicateAlert : checkColor)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: value
                      ? (isAlert ? GrsColors.duplicateAlert : checkColor)
                      : (isDark
                            ? GrsColors.outlineDark
                            : GrsColors.outlineLight),
                  width: 1.5,
                ),
              ),
              child: value
                  ? const Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: Colors.white,
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      color: isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
      indent: 16,
      endIndent: 16,
    );
  }
}
