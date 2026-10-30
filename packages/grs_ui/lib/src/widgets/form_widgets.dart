import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import '../tokens/typography.dart';

/// Catalog of form widget types used across GRS survey forms.
enum GrsFormWidgetType {
  dropdownSelect,
  textInput,
  phoneInput,
  emailInput,
  readOnlyBadge,
  textArea,
  checkbox,
  numberInput,
  radioGroup,
  lookupSelect,
  multiSelectChip,
  consentCheckbox,
}

class GrsFormWidgetsRegistry {
  static const Set<String> supportedWidgets = {
    'DropdownSelect',
    'TextInput',
    'PhoneInput',
    'EmailInput',
    'ReadOnlyBadge',
    'TextArea',
    'Checkbox',
    'NumberInput',
    'RadioGroup',
    'LookupSelect',
    'MultiSelectChip',
    'ConsentCheckbox',
  };

  static bool hasWidget(String widgetName) =>
      supportedWidgets.contains(widgetName);
}

// ────────────────────────────────────────────────────────────────────────────
// GrsReadOnlyBadge
// ────────────────────────────────────────────────────────────────────────────

/// Read-only field display for locked or pre-filled values (e.g. serial numbers).
class GrsReadOnlyBadge extends StatelessWidget {
  final String label;
  final String value;
  final String? languageCode;

  const GrsReadOnlyBadge({
    super.key,
    required this.label,
    required this.value,
    this.languageCode,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark
        ? GrsColors.surfaceVariantDark
        : GrsColors.surfaceVariantLight;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: GrsSpacing.md,
        vertical: GrsSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GrsTypography.labelSmall(
              color: secondary,
              languageCode: languageCode,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GrsTypography.titleMedium(
              color: ink,
              languageCode: languageCode,
            ).copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GrsConsentCheckbox
// ────────────────────────────────────────────────────────────────────────────

/// Consent checkbox ensuring user explicitly confirms data collection.
/// The active state uses the primary colour; the unchecked state shows a
/// subtle border so the control is clearly discoverable.
class GrsConsentCheckbox extends StatelessWidget {
  final bool value;
  final String text;
  final ValueChanged<bool?> onChanged;
  final String? languageCode;

  const GrsConsentCheckbox({
    super.key,
    required this.value,
    required this.text,
    required this.onChanged,
    this.languageCode,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;
    final bg = value
        ? (isDark
              ? GrsColors.primaryContainerDark
              : GrsColors.primaryContainerLight)
        : (isDark
              ? GrsColors.surfaceVariantDark
              : GrsColors.surfaceVariantLight);
    final borderColor = value
        ? primary
        : (isDark ? GrsColors.outlineDark : GrsColors.outlineLight);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeInOut,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: value ? 1.5 : 1),
      ),
      child: CheckboxListTile(
        value: value,
        onChanged: onChanged,
        activeColor: primary,
        checkColor: Colors.white,
        title: Text(
          text,
          style: GrsTypography.bodyMedium(
            color: isDark
                ? GrsColors.textPrimaryDark
                : GrsColors.textPrimaryLight,
            languageCode: languageCode,
          ).copyWith(fontWeight: FontWeight.w500),
        ),
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: GrsSpacing.md,
          vertical: GrsSpacing.xs,
        ),
      ),
    );
  }
}
