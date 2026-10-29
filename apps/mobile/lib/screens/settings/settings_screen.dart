import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../config/env.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';
import '../../providers/database_provider.dart';
import 'update_dialog.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final l10n = GrsL10n.of(context);
    List<dynamic> pending = [];
    try {
      final db = await ref.read(databaseProvider.future);
      pending = await db.getAllClients(status: SyncStatus.pending);
    } catch (_) {
      // Allow sign out even if local DB is inaccessible or already closed
    }

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
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: GrsColors.syncRejected,
              ),
              onPressed: () async {
                Navigator.of(ctx).pop();
                try {
                  ref.invalidate(databaseProvider);
                  await ref.read(authProvider.notifier).logout();
                } catch (_) {}
                if (context.mounted) {
                  context.go('/login');
                }
              },
              child: Text(l10n.get('logout')),
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

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('settings'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile Card
          if (profile != null) ...[
            GrsCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const CircleAvatar(
                        radius: 28,
                        backgroundColor: GrsColors.primaryLight,
                        child: Icon(
                          Icons.person,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              profile.fullName,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              'ID: ${profile.userCode}',
                              style: const TextStyle(
                                color: GrsColors.textSecondaryLight,
                              ),
                            ),
                            Text(
                              'Role: ${profile.role}',
                              style: const TextStyle(
                                color: GrsColors.secondaryLight,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (profile.email != null) ...[
                    const Divider(height: 24),
                    Row(
                      children: [
                        const Icon(
                          Icons.verified,
                          color: GrsColors.syncSynced,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          profile.email!,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],

          // Language Setting
          GrsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.get('language'),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'en', label: Text('English')),
                    ButtonSegment(value: 'si', label: Text('සිංහල')),
                    ButtonSegment(value: 'ta', label: Text('தமிழ்')),
                  ],
                  selected: {currentLang},
                  onSelectionChanged: (selected) {
                    if (selected.isNotEmpty) {
                      ref.read(languageProvider.notifier).state =
                          selected.first;
                    }
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Security Actions
          GrsCard(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.mark_email_read_outlined),
                  title: Text(l10n.get('addEmailTitle')),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () => context.push('/add-email'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: Text(l10n.get('changePasswordTitle')),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () => context.push('/change-password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // App Updates Card
          GrsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.system_update_rounded,
                          color: GrsColors.primaryLight,
                          size: 22,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          l10n.get('checkForUpdates'),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: GrsColors.primaryLight.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'v${AppEnv.appVersion}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: GrsColors.primaryLight,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    radius: 18,
                    backgroundColor: GrsColors.surfaceVariantLight,
                    child: Icon(
                      Icons.cloud_download_outlined,
                      size: 20,
                      color: GrsColors.primaryLight,
                    ),
                  ),
                  title: Text(l10n.get('checkForUpdates')),
                  subtitle: const Text('Check and install latest APK release'),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                  onTap: () {
                    showDialog(
                      context: context,
                      builder: (ctx) =>
                          const UpdateDialog(currentVersion: AppEnv.appVersion),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Sign Out Button
          GrsButton(
            text: l10n.get('logout'),
            variant: GrsButtonVariant.danger,
            icon: Icons.logout,
            onPressed: () => _handleLogout(context, ref),
          ),
        ],
      ),
    );
  }
}
