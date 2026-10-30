import 'package:flutter/material.dart';
import 'package:grs_ui/src/tokens/motions.dart';
import '../tokens/colors.dart';
import 'grs_motion.dart';

enum GrsButtonVariant { primary, secondary, outline, text, gradient, danger }

enum GrsButtonSize { small, medium, large }

/// GRS primary action button — v3.
///
/// Design rules:
/// - Flat fill, square-ish corners (radius 12). No shadows at rest.
/// - Press animation: spring-scale via [GrsBounceTouch].
/// - Haptic: light impact on every press.
/// - Loading state shows a compact spinner with the button's ink colour.
class GrsButton extends StatelessWidget {
  const GrsButton({
    super.key,
    this.label,
    this.text,
    this.onPressed,
    this.variant = GrsButtonVariant.primary,
    this.size = GrsButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
    this.width,
  });

  final String? label;
  final String? text;
  final VoidCallback? onPressed;
  final GrsButtonVariant variant;
  final GrsButtonSize size;
  final IconData? icon;
  final bool isLoading;
  final bool isFullWidth;
  final double? width;

  String get _label => label ?? text ?? '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final (height, hPad, fontSize, iconSize) = switch (size) {
      GrsButtonSize.small => (40.0, 14.0, 13.0, 16.0),
      GrsButtonSize.medium => (50.0, 20.0, 15.0, 18.0),
      GrsButtonSize.large => (56.0, 26.0, 16.0, 20.0),
    };

    // ── Resolve variant colours ──────────────────────────────────────────────
    final (bg, fg, borderColor) = _variantColors(theme, isDark);

    // ── Content ─────────────────────────────────────────────────────────────
    final content = AnimatedSwitcher(
      duration: GrsMotion.durationFast,
      child: isLoading
          ? KeyedSubtree(
              key: const ValueKey('loading'),
              child: SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation<Color>(fg),
                ),
              ),
            )
          : KeyedSubtree(
              key: const ValueKey('label'),
              child: Row(
                mainAxisSize: isFullWidth || width != null
                    ? MainAxisSize.max
                    : MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: iconSize, color: fg),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      _label,
                      style: TextStyle(
                        fontSize: fontSize,
                        fontWeight: FontWeight.w600,
                        color: fg,
                        letterSpacing: -0.2,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
    );

    // ── Button shell ─────────────────────────────────────────────────────────
    Widget shell = Container(
      height: height,
      decoration: BoxDecoration(
        color: borderColor != null ? Colors.transparent : bg,
        borderRadius: BorderRadius.circular(12),
        border: borderColor != null
            ? Border.all(color: borderColor, width: 1.5)
            : null,
      ),
      alignment: Alignment.center,
      padding: EdgeInsets.symmetric(horizontal: hPad),
      child: content,
    );

    // Solid-fill variants get an opacity reduction when disabled, to signal
    // that the action is unavailable without a separate "disabled style".
    if (onPressed == null && !isLoading) {
      shell = Opacity(opacity: 0.45, child: shell);
    }

    if (width != null) {
      shell = SizedBox(width: width, child: shell);
    } else if (isFullWidth) {
      shell = SizedBox(width: double.infinity, child: shell);
    }

    return GrsBounceTouch(onTap: isLoading ? null : onPressed, child: shell);
  }

  /// Returns (backgroundColor, foregroundColor, borderColor?).
  (Color, Color, Color?) _variantColors(ThemeData theme, bool isDark) {
    final primary = theme.colorScheme.primary;
    final onPrimary = theme.colorScheme.onPrimary;

    return switch (variant) {
      GrsButtonVariant.primary => (primary, onPrimary, null),
      GrsButtonVariant.gradient => (primary, onPrimary, null),
      GrsButtonVariant.secondary => (
        isDark
            ? GrsColors.surfaceVariantDark
            : GrsColors.secondaryContainerLight,
        isDark
            ? GrsColors.textPrimaryDark
            : GrsColors.onSecondaryContainerLight,
        isDark ? GrsColors.outlineDark : null,
      ),
      GrsButtonVariant.danger => (GrsColors.syncRejected, Colors.white, null),
      GrsButtonVariant.outline => (
        Colors.transparent,
        isDark ? GrsColors.textPrimaryDark : primary,
        isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
      ),
      GrsButtonVariant.text => (
        Colors.transparent,
        isDark ? GrsColors.textPrimaryDark : primary,
        null,
      ),
    };
  }
}
