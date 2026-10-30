import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';

/// Consent screen — v2.
///
/// Shows the trilingual statutory consent statement.
/// The user must explicitly check the checkbox before proceeding.
/// Language cards use a tone-step background instead of a heavy border.
class ConsentScreen extends StatefulWidget {
  final String houseId;
  const ConsentScreen({super.key, required this.houseId});

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  bool _consentChecked = false;

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('consentTitle'))),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                GrsSpacing.pagePad,
                12,
                GrsSpacing.pagePad,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Header ─────────────────────────────────────────────────
                  GrsFadeIn(
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: isDark
                                ? GrsColors.primaryContainerDark
                                : GrsColors.primaryContainerLight,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.privacy_tip_outlined,
                            color: primary,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.get('consentTitle'),
                                style: GrsTypography.titleLarge(color: ink),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? GrsColors.syncPendingBgDark
                                      : GrsColors.duplicateAlertBg,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'v${DdCampaignConstants.defaultConsentVersion}',
                                  style: GrsTypography.labelSmall(
                                    color: GrsColors.duplicateAlert,
                                  ).copyWith(fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // ── Trilingual statement cards ──────────────────────────────
                  GrsFadeSlideItem(
                    index: 0,
                    child: _LanguageCard(
                      language: 'English',
                      text: DdCampaignConstants.consentTextEn,
                      isDark: isDark,
                      secondary: secondary,
                    ),
                  ),
                  const SizedBox(height: 10),
                  GrsFadeSlideItem(
                    index: 1,
                    child: _LanguageCard(
                      language: 'සිංහල',
                      text: DdCampaignConstants.consentTextSi,
                      isDark: isDark,
                      secondary: secondary,
                      languageCode: 'si',
                    ),
                  ),
                  const SizedBox(height: 10),
                  GrsFadeSlideItem(
                    index: 2,
                    child: _LanguageCard(
                      language: 'தமிழ்',
                      text: DdCampaignConstants.consentTextTa,
                      isDark: isDark,
                      secondary: secondary,
                      languageCode: 'ta',
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),

          // ── Sticky bottom panel ──────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(
              GrsSpacing.pagePad,
              12,
              GrsSpacing.pagePad,
              GrsSpacing.md,
            ),
            decoration: BoxDecoration(
              color: isDark ? GrsColors.surfaceDark : GrsColors.surfaceLight,
              border: Border(
                top: BorderSide(
                  color: isDark
                      ? GrsColors.outlineDark
                      : GrsColors.outlineLight,
                ),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Consent checkbox
                  GrsConsentCheckbox(
                    value: _consentChecked,
                    text: l10n.get('consentCheckboxLabel'),
                    onChanged: (val) =>
                        setState(() => _consentChecked = val ?? false),
                  ),
                  const SizedBox(height: 12),

                  // Proceed button
                  GrsButton(
                    label: 'Proceed to Beneficiary Form',
                    icon: Icons.arrow_forward_rounded,
                    isFullWidth: true,
                    size: GrsButtonSize.large,
                    onPressed: _consentChecked
                        ? () {
                            context.pushReplacement(
                              '/houses/${widget.houseId}/client/new?consent=true',
                            );
                          }
                        : null,
                  ),
                  const SizedBox(height: 8),

                  // Cancel
                  GrsButton(
                    label: l10n.get('cancel'),
                    variant: GrsButtonVariant.text,
                    isFullWidth: true,
                    onPressed: () => context.pop(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LanguageCard extends StatelessWidget {
  const _LanguageCard({
    required this.language,
    required this.text,
    required this.isDark,
    required this.secondary,
    this.languageCode,
  });
  final String language;
  final String text;
  final bool isDark;
  final Color secondary;
  final String? languageCode;

  @override
  Widget build(BuildContext context) {
    return GrsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            language,
            style: GrsTypography.labelSmall(
              color: secondary,
              languageCode: languageCode,
            ).copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.3),
          ),
          const SizedBox(height: 8),
          Text(
            text,
            style: GrsTypography.bodyMedium(
              color: isDark
                  ? GrsColors.textPrimaryDark
                  : GrsColors.textPrimaryLight,
              languageCode: languageCode,
            ),
          ),
        ],
      ),
    );
  }
}
