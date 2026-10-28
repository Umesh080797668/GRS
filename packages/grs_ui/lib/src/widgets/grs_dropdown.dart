import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/typography.dart';

class GrsDropdownItem<T> {
  final T value;
  final String label;

  const GrsDropdownItem({required this.value, required this.label});
}

/// Reusable civic dropdown selector with guaranteed 48dp touch targets.
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: GrsTypography.style(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: textColor,
            languageCode: languageCode,
          ),
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
                style: GrsTypography.style(
                  fontSize: 16,
                  fontWeight: FontWeight.w400,
                  color: textColor,
                  languageCode: languageCode,
                ),
              ),
            );
          }).toList(),
          decoration: InputDecoration(hintText: hint, errorText: errorText),
          icon: const Icon(Icons.arrow_drop_down, size: 28),
        ),
      ],
    );
  }
}
