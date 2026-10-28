import 'package:flutter/material.dart';
import '../tokens/colors.dart';

/// Clean civic card container with 8dp rounded chamfer per DESIGN.md §5.
class GrsCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? backgroundColor;
  final Border? border;

  const GrsCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.backgroundColor,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg =
        backgroundColor ??
        (isDark ? GrsColors.surfaceDark : GrsColors.surfaceLight);
    final cardBorder =
        border ??
        Border.all(
          color: isDark ? GrsColors.outlineDark : GrsColors.outlineLight,
          width: 1,
        );

    final cardContent = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: cardBorder,
      ),
      child: child,
    );

    if (onTap != null) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: cardContent,
      );
    }
    return cardContent;
  }
}
