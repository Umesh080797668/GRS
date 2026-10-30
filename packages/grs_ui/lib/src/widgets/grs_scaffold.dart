import 'package:flutter/material.dart';
import 'offline_banner.dart';
import '../tokens/colors.dart';

/// GRS app scaffold — v2.
///
/// Provides:
/// - Themed AppBar with optional back button, title + subtitle, and actions.
/// - Optional persistent offline banner below the AppBar.
/// - Slot for body, FAB, bottom nav.
class GrsScaffold extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final Widget? bottomNavigationBar;
  final bool isOffline;
  final String? offlineMessage;
  final bool showBackButton;
  final VoidCallback? onBack;

  const GrsScaffold({
    super.key,
    required this.title,
    this.subtitle,
    required this.body,
    this.actions,
    this.floatingActionButton,
    this.bottomNavigationBar,
    this.isOffline = false,
    this.offlineMessage,
    this.showBackButton = false,
    this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    Widget titleWidget;
    if (subtitle != null) {
      titleWidget = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
              color: isDark
                  ? GrsColors.textPrimaryDark
                  : GrsColors.textPrimaryLight,
            ),
          ),
          Text(
            subtitle!,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              color: isDark
                  ? GrsColors.textSecondaryDark
                  : GrsColors.textSecondaryLight,
            ),
          ),
        ],
      );
    } else {
      titleWidget = Text(
        title,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
          color: isDark
              ? GrsColors.textPrimaryDark
              : GrsColors.textPrimaryLight,
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: titleWidget,
        leading: showBackButton
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              )
            : null,
        automaticallyImplyLeading: showBackButton,
        actions: actions,
      ),
      body: Column(
        children: [
          if (isOffline)
            GrsOfflineBanner(
              message:
                  offlineMessage ??
                  'Offline — records will sync when connected.',
              languageCode: null,
            ),
          Expanded(child: body),
        ],
      ),
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}
