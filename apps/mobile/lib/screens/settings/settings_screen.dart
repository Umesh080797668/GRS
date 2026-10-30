import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../config/env.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/database_provider.dart';
import '../../providers/theme_provider.dart';
import 'update_dialog.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final l10n = GrsL10n.of(context);
    List<dynamic> pending = [];
    try {
      final db = await ref.read(databaseProvider.future);
      pending = await db.getAllClients(status: SyncStatus.pending);
    } catch (_) {}

    if (context.mounted) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.get('logoutConfirmTitle')),
          content: Text(
            pending.isNotEmpty
                ? l10n.get('logoutWarning')
                : 'Are you sure you want to sign out?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(l10n.get('cancel')),
            ),
            TextButton(
              style: TextButton.styleFrom(
                foregroundColor: GrsColors.syncRejected,
              ),
              onPressed: () async {
                Navigator.of(ctx).pop();
                try {
                  ref.invalidate(databaseProvider);
                  await ref.read(authProvider.notifier).logout();
                } catch (_) {}
                if (context.mounted) context.go('/login');
              },
              child: Text(
                l10n.get('logout'),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final profile = authState.profile;
    final l10n = GrsL10n.of(context);
    final currentLang = ref.watch(languageProvider);
    final currentTheme = ref.watch(themeModeProvider);
    final isOnline = ref.watch(connectivityProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Scaffold(
      appBar: AppBar(title: GrsRiseIn(child: Text(l10n.get('settings')))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          // ── Profile Card ───────────────────────────────────────────────────
          if (profile != null) ...[
            GrsFadeSlideItem(
              index: 0,
              child: GrsCard(
                child: Row(
                  children: [
                    // Avatar
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: isDark
                            ? GrsColors.primaryContainerDark
                            : GrsColors.primaryContainerLight,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        Icons.person_rounded,
                        size: 28,
                        color: primary,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile.fullName,
                            style: GrsTypography.titleLarge(color: ink),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'ID: ${profile.userCode}',
                            style: GrsTypography.bodyMedium(color: secondary),
                          ),
                          const SizedBox(height: 4),
                          // Badges row: role + connectivity
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? GrsColors.primaryContainerDark
                                      : GrsColors.primaryContainerLight,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  profile.role,
                                  style: GrsTypography.labelSmall(
                                    color: primary,
                                  ).copyWith(fontWeight: FontWeight.w700),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: isOnline
                                      ? (isDark
                                            ? GrsColors.syncSyncedBgDark
                                            : GrsColors.syncSyncedBg)
                                      : (isDark
                                            ? const Color(0xFF292109)
                                            : const Color(0xFFFEF3C7)),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 6,
                                      height: 6,
                                      decoration: BoxDecoration(
                                        color: isOnline
                                            ? GrsColors.syncSynced
                                            : const Color(0xFFF59E0B),
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 5),
                                    Text(
                                      isOnline ? 'Online' : 'Offline Mode',
                                      style: GrsTypography.labelSmall(
                                        color: isOnline
                                            ? GrsColors.syncSynced
                                            : (isDark
                                                  ? const Color(0xFFFBBF24)
                                                  : const Color(0xFFB45309)),
                                      ).copyWith(fontWeight: FontWeight.w600),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            if (profile.email != null) ...[
              const SizedBox(height: 8),
              GrsFadeSlideItem(
                index: 1,
                child: GrsCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.verified_rounded,
                        color: GrsColors.syncSynced,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          profile.email!,
                          style: GrsTypography.bodyMedium(
                            color: ink,
                          ).copyWith(fontWeight: FontWeight.w500),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],

            const SizedBox(height: 20),
          ],

          // ── Section: Language ──────────────────────────────────────────────
          GrsFadeSlideItem(
            index: 2,
            child: _SectionLabel(label: l10n.get('language'), isDark: isDark),
          ),
          const SizedBox(height: 8),
          GrsFadeSlideItem(
            index: 3,
            child: GrsCard(
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'en', label: Text('English')),
                  ButtonSegment(value: 'si', label: Text('සිංහල')),
                  ButtonSegment(value: 'ta', label: Text('தமிழ்')),
                ],
                selected: {currentLang},
                onSelectionChanged: (selected) {
                  if (selected.isNotEmpty) {
                    ref.read(languageProvider.notifier).state = selected.first;
                  }
                },
                expandedInsets: EdgeInsets.zero,
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Section: Appearance / Theme ────────────────────────────────────
          GrsFadeSlideItem(
            index: 4,
            child: _SectionLabel(label: 'Appearance', isDark: isDark),
          ),
          const SizedBox(height: 8),
          GrsFadeSlideItem(
            index: 5,
            child: GrsCard(
              child: SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment(
                    value: ThemeMode.system,
                    icon: Icon(Icons.brightness_auto_rounded, size: 16),
                    label: Text('System'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.light,
                    icon: Icon(Icons.light_mode_rounded, size: 16),
                    label: Text('Light'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.dark,
                    icon: Icon(Icons.dark_mode_rounded, size: 16),
                    label: Text('Dark'),
                  ),
                ],
                selected: {currentTheme},
                onSelectionChanged: (selected) {
                  if (selected.isNotEmpty) {
                    ref
                        .read(themeModeProvider.notifier)
                        .setThemeMode(selected.first);
                  }
                },
                expandedInsets: EdgeInsets.zero,
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Section: Account ───────────────────────────────────────────────
          GrsFadeSlideItem(
            index: 4,
            child: _SectionLabel(label: 'Account', isDark: isDark),
          ),
          const SizedBox(height: 8),
          GrsFadeSlideItem(
            index: 5,
            child: GrsCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _SettingsTile(
                    icon: Icons.mark_email_read_outlined,
                    title: l10n.get('addEmailTitle'),
                    onTap: () => context.push('/add-email'),
                    isDark: isDark,
                  ),
                  Divider(
                    height: 1,
                    color: isDark
                        ? GrsColors.outlineDark
                        : GrsColors.outlineLight,
                    indent: 16,
                    endIndent: 16,
                  ),
                  _SettingsTile(
                    icon: Icons.lock_outline_rounded,
                    title: l10n.get('changePasswordTitle'),
                    onTap: () => context.push('/change-password'),
                    isDark: isDark,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Section: App ───────────────────────────────────────────────────
          GrsFadeSlideItem(
            index: 6,
            child: _SectionLabel(label: 'App', isDark: isDark),
          ),
          const SizedBox(height: 8),
          GrsFadeSlideItem(
            index: 7,
            child: GrsCard(
              padding: EdgeInsets.zero,
              child: _SettingsTile(
                icon: Icons.system_update_rounded,
                title: l10n.get('checkForUpdates'),
                trailing: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: isDark
                        ? GrsColors.primaryContainerDark
                        : GrsColors.primaryContainerLight,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'v${AppEnv.appVersion}',
                    style: GrsTypography.labelSmall(
                      color: primary,
                    ).copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                onTap: () {
                  showDialog(
                    context: context,
                    builder: (ctx) =>
                        const UpdateDialog(currentVersion: AppEnv.appVersion),
                  );
                },
                isDark: isDark,
              ),
            ),
          ),

          const SizedBox(height: 32),

          // ── Sign Out ───────────────────────────────────────────────────────
          GrsFadeSlideItem(
            index: 8,
            child: GrsButton(
              text: l10n.get('logout'),
              variant: GrsButtonVariant.danger,
              icon: Icons.logout_rounded,
              isFullWidth: true,
              onPressed: () => _handleLogout(context, ref),
            ),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.isDark});
  final String label;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        label.toUpperCase(),
        style: GrsTypography.labelSmall(
          color: isDark
              ? GrsColors.textTertiaryDark
              : GrsColors.textTertiaryLight,
        ).copyWith(letterSpacing: 0.8, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.onTap,
    required this.isDark,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final bool isDark;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return GrsBounceTouch(
      onTap: onTap,
      scaleFactor: 0.99,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: secondary),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: GrsTypography.bodyLarge(
                  color: ink,
                ).copyWith(fontWeight: FontWeight.w500, fontSize: 15),
              ),
            ),
            trailing ??
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 14,
                  color: secondary,
                ),
          ],
        ),
      ),
    );
  }
}
