import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import 'grs_motion.dart';

enum GrsButtonVariant { primary, secondary, outline, text, gradient, danger }

enum GrsButtonSize { small, medium, large }

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

  String get _effectiveLabel => label ?? text ?? '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final (height, horizontalPadding, fontSize) = switch (size) {
      GrsButtonSize.small => (38.0, 14.0, 13.0),
      GrsButtonSize.medium => (48.0, 20.0, 15.0),
      GrsButtonSize.large => (56.0, 24.0, 16.0),
    };

    final content = AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: isLoading
          ? SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  variant == GrsButtonVariant.outline ||
                          variant == GrsButtonVariant.text
                      ? theme.colorScheme.primary
                      : Colors.white,
                ),
              ),
            )
          : Row(
              mainAxisSize: isFullWidth || width != null
                  ? MainAxisSize.max
                  : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: fontSize + 3),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Text(
                    _effectiveLabel,
                    style: TextStyle(
                      fontSize: fontSize,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
    );

    Widget buttonWidget;

    if (variant == GrsButtonVariant.gradient) {
      buttonWidget = Container(
        height: height,
        decoration: BoxDecoration(
          gradient: GrsColors.primaryGradient,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: GrsColors.primaryLight.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: const TextStyle(color: Colors.white),
          child: IconTheme(
            data: const IconThemeData(color: Colors.white),
            child: content,
          ),
        ),
      );
    } else if (variant == GrsButtonVariant.primary) {
      buttonWidget = Container(
        height: height,
        decoration: BoxDecoration(
          color: theme.colorScheme.primary,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.primary.withValues(alpha: 0.25),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: TextStyle(color: theme.colorScheme.onPrimary),
          child: IconTheme(
            data: IconThemeData(color: theme.colorScheme.onPrimary),
            child: content,
          ),
        ),
      );
    } else if (variant == GrsButtonVariant.danger) {
      buttonWidget = Container(
        height: height,
        decoration: BoxDecoration(
          color: GrsColors.syncRejected,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: GrsColors.syncRejected.withValues(alpha: 0.25),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: const TextStyle(color: Colors.white),
          child: IconTheme(
            data: const IconThemeData(color: Colors.white),
            child: content,
          ),
        ),
      );
    } else if (variant == GrsButtonVariant.secondary) {
      buttonWidget = Container(
        height: height,
        decoration: BoxDecoration(
          color: theme.colorScheme.secondary,
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: TextStyle(color: theme.colorScheme.onSecondary),
          child: IconTheme(
            data: IconThemeData(color: theme.colorScheme.onSecondary),
            child: content,
          ),
        ),
      );
    } else if (variant == GrsButtonVariant.outline) {
      buttonWidget = Container(
        height: height,
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
            width: 1.5,
          ),
        ),
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: TextStyle(color: theme.colorScheme.primary),
          child: IconTheme(
            data: IconThemeData(color: theme.colorScheme.primary),
            child: content,
          ),
        ),
      );
    } else {
      buttonWidget = Container(
        height: height,
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: DefaultTextStyle(
          style: TextStyle(color: theme.colorScheme.primary),
          child: IconTheme(
            data: IconThemeData(color: theme.colorScheme.primary),
            child: content,
          ),
        ),
      );
    }

    if (width != null) {
      buttonWidget = SizedBox(width: width, child: buttonWidget);
    } else if (isFullWidth) {
      buttonWidget = SizedBox(width: double.infinity, child: buttonWidget);
    }

    return GrsBounceTouch(
      onTap: isLoading ? null : onPressed,
      child: buttonWidget,
    );
  }
}
