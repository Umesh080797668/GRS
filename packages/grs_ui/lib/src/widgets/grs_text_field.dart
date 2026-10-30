import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import '../tokens/typography.dart';

/// GRS text input — v2.
///
/// Dark-mode aware, consistent with GrsDropdown label style.
/// Password toggle uses a subtle icon-button with no extra decoration.
class GrsTextField extends StatefulWidget {
  final TextEditingController? controller;
  final String? initialValue;
  final String label;
  final String? hint;
  final String? helperText;
  final String? errorText;
  final bool isPassword;
  final TextInputType keyboardType;
  final TextInputAction textInputAction;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onEditingComplete;
  final bool enabled;
  final bool readOnly;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final String? languageCode;
  final int maxLines;

  const GrsTextField({
    super.key,
    this.controller,
    this.initialValue,
    required this.label,
    this.hint,
    this.helperText,
    this.errorText,
    this.isPassword = false,
    this.keyboardType = TextInputType.text,
    this.textInputAction = TextInputAction.next,
    this.validator,
    this.onChanged,
    this.onEditingComplete,
    this.enabled = true,
    this.readOnly = false,
    this.prefixIcon,
    this.suffixIcon,
    this.languageCode,
    this.maxLines = 1,
  });

  @override
  State<GrsTextField> createState() => _GrsTextFieldState();
}

class _GrsTextFieldState extends State<GrsTextField> {
  late bool _obscured;

  @override
  void initState() {
    super.initState();
    _obscured = widget.isPassword;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark
        ? GrsColors.textPrimaryDark
        : GrsColors.textPrimaryLight;
    final labelColor = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final iconColor = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    final inputStyle = GrsTypography.bodyLarge(
      color: textColor,
      languageCode: widget.languageCode,
    );

    Widget? suffix = widget.suffixIcon;
    if (widget.isPassword) {
      suffix = IconButton(
        icon: Icon(
          _obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          size: 20,
          color: iconColor,
        ),
        onPressed: () => setState(() => _obscured = !_obscured),
        splashRadius: 20,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.label,
          style: GrsTypography.labelMedium(
            color: labelColor,
            languageCode: widget.languageCode,
          ).copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: widget.controller,
          initialValue: widget.initialValue,
          obscureText: _obscured,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          validator: widget.validator,
          onChanged: widget.onChanged,
          onEditingComplete: widget.onEditingComplete,
          enabled: widget.enabled,
          readOnly: widget.readOnly,
          maxLines: widget.isPassword ? 1 : widget.maxLines,
          style: inputStyle,
          decoration: InputDecoration(
            hintText: widget.hint,
            helperText: widget.helperText,
            errorText: widget.errorText,
            prefixIcon: widget.prefixIcon,
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}
