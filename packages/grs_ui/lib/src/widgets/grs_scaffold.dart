import 'package:flutter/material.dart';
import 'offline_banner.dart';

/// App scaffold providing civic header and persistent offline state notification.
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
    Widget titleWidget;
    if (subtitle != null) {
      titleWidget = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          Text(
            subtitle!,
            style: const TextStyle(fontSize: 12, color: Colors.white70),
          ),
        ],
      );
    } else {
      titleWidget = Text(
        title,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: titleWidget,
        leading: showBackButton
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              )
            : null,
        actions: actions,
      ),
      body: Column(
        children: [
          if (isOffline)
            GrsOfflineBanner(
              message:
                  offlineMessage ??
                  'You are currently offline. Records will be saved locally and synced later.',
            ),
          Expanded(child: body),
        ],
      ),
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}
