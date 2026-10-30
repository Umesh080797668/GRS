import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';

/// Forgot Password screen — v2.
///
/// Two-step flow: enter email → enter code + new password.
/// Step indicator and staggered entrance animations.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _isStep2 = false;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _sendResetCode() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _errorMessage = 'Please enter a valid email address');
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.forgotPassword(email);
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isStep2 = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(GrsL10n.of(context).get('resetCodeSentNotice')),
          ),
        );
      }
    } on GrsApiException catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.messageKey;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'An unexpected error occurred. Please try again.';
        });
      }
    }
  }

  Future<void> _submitReset() async {
    final code = _codeController.text.trim();
    final newPassword = _passwordController.text;

    if (code.length != 6) {
      setState(() => _errorMessage = 'Code must be 6 digits');
      return;
    }
    if (newPassword.length < 8) {
      setState(() => _errorMessage = 'Password must be at least 8 characters');
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.resetPassword(
        email: _emailController.text.trim(),
        code: code,
        newPassword: newPassword,
      );
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(GrsL10n.of(context).get('resetSuccessMessage')),
          ),
        );
        context.go('/login');
      }
    } on GrsApiException catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.messageKey;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'An unexpected error occurred. Please try again.';
        });
      }
    }
  }

  void _showContactAdminDialog(GrsL10n l10n) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.get('askAdminButton')),
        content: Text(l10n.get('forgotPasswordPrompt')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.get('cancel')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primary = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _isStep2
              ? l10n.get('resetPasswordTitle')
              : l10n.get('forgotPasswordTitle'),
        ),
        actions: const [LanguagePickerWidget()],
      ),
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

                  // ── Step indicator ────────────────────────────────────────
                  _StepIndicator(
                    step: _isStep2 ? 2 : 1,
                    total: 2,
                    isDark: isDark,
                  ),
                  const SizedBox(height: 28),

                  // ── Icon + heading ────────────────────────────────────────
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
                          _isStep2
                              ? l10n.get('resetPasswordTitle')
                              : l10n.get('forgotPasswordTitle'),
                          style: GrsTypography.headlineLarge(
                            color: ink,
                          ).copyWith(fontSize: 22),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _isStep2
                              ? l10n.get('resetPasswordPrompt')
                              : l10n.get('forgotPasswordPrompt'),
                          style: GrsTypography.bodyMedium(color: secondary),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // ── Error banner ──────────────────────────────────────────
                  if (_errorMessage != null) ...[
                    _ErrorBanner(message: _errorMessage!, isDark: isDark),
                    const SizedBox(height: 20),
                  ],

                  // ── Step 1: Email ─────────────────────────────────────────
                  if (!_isStep2) ...[
                    GrsRiseIn(
                      delay: const Duration(milliseconds: 180),
                      child: GrsTextField(
                        controller: _emailController,
                        label: l10n.get('emailLabel'),
                        hint: 'name@example.com',
                        keyboardType: TextInputType.emailAddress,
                        prefixIcon: const Icon(Icons.email_outlined, size: 20),
                        enabled: !_isLoading,
                      ),
                    ),
                    const SizedBox(height: 24),
                    GrsRiseIn(
                      delay: const Duration(milliseconds: 240),
                      child: GrsButton(
                        label: l10n.get('sendResetButton'),
                        isLoading: _isLoading,
                        isFullWidth: true,
                        size: GrsButtonSize.large,
                        onPressed: _sendResetCode,
                      ),
                    ),
                    const SizedBox(height: 12),
                    GrsFadeIn(
                      delay: const Duration(milliseconds: 300),
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          side: BorderSide(
                            color: isDark
                                ? GrsColors.outlineDark
                                : GrsColors.outlineLight,
                          ),
                        ),
                        onPressed: () => _showContactAdminDialog(l10n),
                        child: Text(
                          l10n.get('askAdminButton'),
                          style: GrsTypography.labelMedium(
                            color: isDark
                                ? GrsColors.textPrimaryDark
                                : GrsColors.textPrimaryLight,
                          ),
                        ),
                      ),
                    ),

                    // ── Step 2: Code + new password ───────────────────────────
                  ] else ...[
                    GrsRiseIn(
                      delay: const Duration(milliseconds: 160),
                      child: GrsTextField(
                        controller: _codeController,
                        label: l10n.get('verificationCodeLabel'),
                        hint: '123456',
                        keyboardType: TextInputType.number,
                        prefixIcon: const Icon(Icons.pin_outlined, size: 20),
                        enabled: !_isLoading,
                      ),
                    ),
                    const SizedBox(height: 14),
                    GrsRiseIn(
                      delay: const Duration(milliseconds: 220),
                      child: GrsTextField(
                        controller: _passwordController,
                        label: l10n.get('newPasswordLabel'),
                        isPassword: true,
                        prefixIcon: const Icon(
                          Icons.lock_outline_rounded,
                          size: 20,
                        ),
                        enabled: !_isLoading,
                      ),
                    ),
                    const SizedBox(height: 24),
                    GrsRiseIn(
                      delay: const Duration(milliseconds: 280),
                      child: GrsButton(
                        label: l10n.get('resetPasswordButton'),
                        isLoading: _isLoading,
                        isFullWidth: true,
                        size: GrsButtonSize.large,
                        onPressed: _submitReset,
                      ),
                    ),
                  ],

                  const SizedBox(height: 16),

                  GrsFadeIn(
                    delay: const Duration(milliseconds: 360),
                    child: Center(
                      child: TextButton(
                        onPressed: () => context.go('/login'),
                        child: Text(
                          l10n.get('cancel'),
                          style: TextStyle(color: primary),
                        ),
                      ),
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

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({
    required this.step,
    required this.total,
    required this.isDark,
  });
  final int step;
  final int total;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final active = isDark ? GrsColors.primaryDark : GrsColors.primaryLight;
    final inactive = isDark ? GrsColors.outlineDark : GrsColors.outlineLight;

    return Row(
      children: List.generate(total, (i) {
        final isActive = i < step;
        return Expanded(
          child: AnimatedContainer(
            duration: GrsMotion.durationMedium,
            curve: GrsMotion.curveEnter,
            margin: EdgeInsets.only(right: i < total - 1 ? 6 : 0),
            height: 4,
            decoration: BoxDecoration(
              color: isActive ? active : inactive,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
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
