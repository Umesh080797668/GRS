import 'package:flutter/material.dart';
import '../tokens/colors.dart';

enum GrsButtonVariant { primary, secondary, outline, danger }

/// Reusable civic button with guaranteed >= 48dp touch target per DESIGN.md §6.
class GrsButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final GrsButtonVariant variant;
  final bool isLoading;
  final IconData? icon;
  final double? width;

  const GrsButton({
    super.key,
    required this.text,
    this.onPressed,
    this.variant = GrsButtonVariant.primary,
    this.isLoading = false,
    this.icon,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    Widget content;
    if (isLoading) {
      content = const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      );
    } else if (icon != null) {
      content = Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
    } else {
      content = Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        textAlign: TextAlign.center,
      );
    }

    ButtonStyle style;
    switch (variant) {
      case GrsButtonVariant.primary:
        style = ElevatedButton.styleFrom(
          backgroundColor: GrsColors.primaryLight,
          foregroundColor: Colors.white,
          minimumSize: Size(width ?? 88, 48), // 48dp floor
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        );
        break;
      case GrsButtonVariant.secondary:
        style = ElevatedButton.styleFrom(
          backgroundColor: GrsColors.secondaryLight,
          foregroundColor: Colors.white,
          minimumSize: Size(width ?? 88, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        );
        break;
      case GrsButtonVariant.outline:
        style = OutlinedButton.styleFrom(
          foregroundColor: GrsColors.primaryLight,
          minimumSize: Size(width ?? 88, 48),
          side: const BorderSide(color: GrsColors.primaryLight, width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        );
        break;
      case GrsButtonVariant.danger:
        style = ElevatedButton.styleFrom(
          backgroundColor: GrsColors.syncRejected,
          foregroundColor: Colors.white,
          minimumSize: Size(width ?? 88, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        );
        break;
    }

    Widget button;
    if (variant == GrsButtonVariant.outline) {
      button = OutlinedButton(
        style: style,
        onPressed: isLoading ? null : onPressed,
        child: content,
      );
    } else {
      button = ElevatedButton(
        style: style,
        onPressed: isLoading ? null : onPressed,
        child: content,
      );
    }

    if (width != null) {
      return SizedBox(width: width, child: button);
    }
    return button;
  }
}
