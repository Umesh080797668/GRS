import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/permission_provider.dart';

/// Screen displayed when mandatory app permissions are denied.
/// Prevents app usage until required permissions are granted.
/// If user denies or chooses to exit, the app cleanly closes.
class PermissionGateScreen extends ConsumerStatefulWidget {
  const PermissionGateScreen({super.key});

  @override
  ConsumerState<PermissionGateScreen> createState() =>
      _PermissionGateScreenState();
}

class _PermissionGateScreenState extends ConsumerState<PermissionGateScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Auto-prompt request on initial open if not yet granted
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = ref.read(permissionGateProvider);
      if (!state.isGranted && !state.isPermanentlyDenied) {
        ref.read(permissionGateProvider.notifier).requestPermissions();
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Re-evaluate permissions when returning from device settings
      ref.read(permissionGateProvider.notifier).checkPermissions();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final gateState = ref.watch(permissionGateProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;
    final bg = isDark ? GrsColors.backgroundDark : GrsColors.backgroundLight;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          ref.read(permissionGateProvider.notifier).exitApp();
        }
      },
      child: Scaffold(
        backgroundColor: bg,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Header Icon Badge ─────────────────────────────────────
                    Center(
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: isDark
                              ? GrsColors.primaryContainerDark
                              : GrsColors.primaryContainerLight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Icon(
                          Icons.security_rounded,
                          size: 40,
                          color: primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // ── Title & Subtitle ──────────────────────────────────────
                    Text(
                      l10n.get('permissionsRequiredTitle'),
                      style: GrsTypography.headlineLarge(
                        color: ink,
                      ).copyWith(fontSize: 22, letterSpacing: -0.5),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      l10n.get('permissionsRequiredMessage'),
                      style: GrsTypography.bodyMedium(color: secondary),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),

                    // ── Permission Details Card ───────────────────────────────
                    GrsCard(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? const Color(0xFF1E293B)
                                  : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              Icons.notifications_active_outlined,
                              size: 22,
                              color: primary,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l10n.get('notificationPermissionTitle'),
                                  style: GrsTypography.titleMedium(color: ink)
                                      .copyWith(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                      ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  l10n.get('notificationPermissionDesc'),
                                  style: GrsTypography.labelSmall(
                                    color: secondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Notice Alert ──────────────────────────────────────────
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF2E1C0A)
                            : const Color(0xFFFFFBEB),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.info_outline_rounded,
                            color: Color(0xFFD97706),
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              l10n.get('permissionsRequiredNotice'),
                              style: GrsTypography.labelSmall(
                                color: isDark
                                    ? const Color(0xFFFDE68A)
                                    : const Color(0xFF92400E),
                              ).copyWith(fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),

                    // ── Primary Action Button ─────────────────────────────────
                    if (gateState.isPermanentlyDenied) ...[
                      GrsButton(
                        text: l10n.get('openSettingsButton'),
                        icon: Icons.settings_rounded,
                        isFullWidth: true,
                        size: GrsButtonSize.large,
                        onPressed: () => ref
                            .read(permissionGateProvider.notifier)
                            .openSettings(),
                      ),
                    ] else ...[
                      GrsButton(
                        text: l10n.get('grantPermissionsButton'),
                        icon: Icons.check_circle_outline_rounded,
                        isFullWidth: true,
                        isLoading: gateState.isChecking,
                        size: GrsButtonSize.large,
                        onPressed: () => ref
                            .read(permissionGateProvider.notifier)
                            .requestPermissions(),
                      ),
                    ],
                    const SizedBox(height: 12),

                    // ── Secondary Action: Close / Exit App ────────────────────
                    GrsButton(
                      text: l10n.get('exitAppButton'),
                      variant: GrsButtonVariant.outline,
                      icon: Icons.exit_to_app_rounded,
                      isFullWidth: true,
                      size: GrsButtonSize.large,
                      onPressed: () =>
                          ref.read(permissionGateProvider.notifier).exitApp(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
