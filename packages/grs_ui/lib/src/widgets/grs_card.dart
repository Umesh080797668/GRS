import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import 'grs_motion.dart';

class GrsCard extends StatelessWidget {
  const GrsCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.borderColor,
    this.backgroundColor,
    this.elevation,
    this.hasGlow = false,
    this.border,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? borderColor;
  final Color? backgroundColor;
  final double? elevation;
  final bool hasGlow;
  final Border? border;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final resolvedBg =
        backgroundColor ??
        (isDark ? GrsColors.surfaceDark : GrsColors.surfaceLight);
    final resolvedBorder =
        border ??
        Border.all(
          color:
              borderColor ??
              (isDark ? GrsColors.outlineDark : GrsColors.outlineLight),
          width: 1,
        );

    final cardContent = Container(
      margin: margin,
      decoration: BoxDecoration(
        color: resolvedBg,
        borderRadius: BorderRadius.circular(18),
        border: resolvedBorder,
        boxShadow: [
          // Soft ambient shadow
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.3)
                : const Color(0xFF0F172A).withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          if (hasGlow)
            BoxShadow(
              color: GrsColors.primaryLight.withValues(alpha: 0.12),
              blurRadius: 20,
              offset: const Offset(0, 6),
            ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
        ),
      ),
    );

    if (onTap != null) {
      return GrsBounceTouch(
        onTap: onTap,
        scaleFactor: 0.985,
        child: cardContent,
      );
    }

    return cardContent;
  }
}
