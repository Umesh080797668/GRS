import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

/// Change Password screen — v2.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      ref
          .read(authProvider.notifier)
          .changePassword(
            _currentPasswordController.text,
            _newPasswordController.text,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final l10n = GrsL10n.of(context);
    final isLoading = authState.status == AuthStatus.authenticating;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('changePasswordTitle'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(GrsSpacing.pagePad),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: GrsFadeIn(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),

                  // ── Icon + Heading ──────────────────────────────────────
                  GrsRiseIn(
                    child: Column(
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: isDark
                                ? GrsColors.primaryContainerDark
                                : GrsColors.primaryContainerLight,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Icon(
                            Icons.lock_reset_rounded,
                            size: 36,
                            color: primary,
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          l10n.get('changePasswordTitle'),
                          style: GrsTypography.headlineLarge(
                            color: ink,
                          ).copyWith(fontSize: 22),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          l10n.get('changePasswordSubtitle'),
                          style: GrsTypography.bodyMedium(color: secondary),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // ── Error banner ────────────────────────────────────────
                  if (authState.errorMessage != null) ...[
                    _ErrorBanner(
                      message: authState.errorMessage!,
                      isDark: isDark,
                    ),
                    const SizedBox(height: 20),
                  ],

                  // ── Fields ──────────────────────────────────────────────
                  GrsRiseIn(
                    delay: const Duration(milliseconds: 160),
                    child: GrsTextField(
                      controller: _currentPasswordController,
                      label: l10n.get('currentPasswordLabel'),
                      isPassword: true,
                      prefixIcon: const Icon(
                        Icons.lock_outline_rounded,
                        size: 20,
                      ),
                      validator: (val) {
                        if (val == null || val.isEmpty) {
                          return 'Please enter your current password';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(height: 14),

                  GrsRiseIn(
                    delay: const Duration(milliseconds: 220),
                    child: GrsTextField(
                      controller: _newPasswordController,
                      label: l10n.get('newPasswordLabel'),
                      isPassword: true,
                      prefixIcon: const Icon(
                        Icons.lock_person_outlined,
                        size: 20,
                      ),
                      helperText:
                          'Min 8 chars · uppercase · number · special character',
                      validator: (val) {
                        final result = GrsValidators.validatePassword(val);
                        if (!result.isValid) {
                          return result.error ??
                              'Password does not meet requirements';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(height: 14),

                  GrsRiseIn(
                    delay: const Duration(milliseconds: 280),
                    child: GrsTextField(
                      controller: _confirmPasswordController,
                      label: l10n.get('confirmPasswordLabel'),
                      isPassword: true,
                      prefixIcon: const Icon(
                        Icons.check_circle_outline_rounded,
                        size: 20,
                      ),
                      validator: (val) {
                        if (val != _newPasswordController.text) {
                          return l10n.get('passwordMismatchError');
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(height: 28),

                  GrsRiseIn(
                    delay: const Duration(milliseconds: 340),
                    child: GrsButton(
                      label: l10n.get('updatePasswordButton'),
                      isLoading: isLoading,
                      isFullWidth: true,
                      size: GrsButtonSize.large,
                      onPressed: _submit,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.isDark});
  final String message;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? GrsColors.syncRejectedBgDark : GrsColors.syncRejectedBg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_rounded,
            color: GrsColors.syncRejected,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: GrsTypography.bodyMedium(
                color: GrsColors.syncRejected,
              ).copyWith(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
