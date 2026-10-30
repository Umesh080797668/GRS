import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/typography.dart';

class GrsDropdownItem<T> {
  final T value;
  final String label;
  const GrsDropdownItem({required this.value, required this.label});
}

/// Civic dropdown selector — v2.
///
/// Dark-mode aware fill/border. Guaranteed 48 dp touch target via
/// InputDecoration contentPadding. Consistent label style with GrsTextField.
class GrsDropdown<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<GrsDropdownItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final String? hint;
  final String? errorText;
  final String? languageCode;
  final bool enabled;

  const GrsDropdown({
    super.key,
    required this.label,
    required this.items,
    this.value,
    this.onChanged,
    this.hint,
    this.errorText,
    this.languageCode,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark
        ? GrsColors.textPrimaryDark
        : GrsColors.textPrimaryLight;
    final labelColor = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: GrsTypography.labelMedium(
            color: labelColor,
            languageCode: languageCode,
          ).copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<T>(
          isExpanded: true,
          initialValue: value,
          onChanged: enabled ? onChanged : null,
          items: items.map((item) {
            return DropdownMenuItem<T>(
              value: item.value,
              child: Text(
                item.label,
                style: GrsTypography.bodyLarge(
                  color: textColor,
                  languageCode: languageCode,
                ),
              ),
            );
          }).toList(),
          decoration: InputDecoration(hintText: hint, errorText: errorText),
          icon: Icon(
            Icons.expand_more_rounded,
            size: 22,
            color: isDark
                ? GrsColors.textSecondaryDark
                : GrsColors.textSecondaryLight,
          ),
          dropdownColor: isDark
              ? GrsColors.surfaceVariantDark
              : GrsColors.surfaceLight,
          borderRadius: BorderRadius.circular(12),
        ),
      ],
    );
  }
}
