import 'package:flutter/material.dart';
import '../tokens/colors.dart';
import 'grs_motion.dart';

/// GRS card — v3.
///
/// Design rules:
/// - Flat surface, one-tone step above the scaffold ground.
/// - Border: a single 1 px line in the outline colour; no shadow at rest.
/// - Tappable: spring-scale press via [GrsBounceTouch].
/// - Radius: 16 px consistently.
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

  /// Unused in v3 (cards are flat). Retained for API compat.
  final double? elevation;

  /// Unused in v3. Retained for API compat.
  final bool hasGlow;

  final Border? border;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bg =
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

    final card = Container(
      margin: margin,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: resolvedBorder,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
        ),
      ),
    );

    if (onTap != null) {
      return GrsBounceTouch(onTap: onTap, scaleFactor: 0.985, child: card);
    }
    return card;
  }
}
