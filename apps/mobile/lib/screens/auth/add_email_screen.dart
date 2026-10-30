import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

/// Add Email screen — v2.
///
/// Two-step flow: enter email → enter 6-digit code.
/// Step indicator shows progress visually.
class AddEmailScreen extends ConsumerStatefulWidget {
  const AddEmailScreen({super.key});

  @override
  ConsumerState<AddEmailScreen> createState() => _AddEmailScreenState();
}

class _AddEmailScreenState extends ConsumerState<AddEmailScreen> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    if (!email.contains('@') || !email.contains('.')) {
      setState(() => _error = 'Please enter a valid email address');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).addEmail(email);
      setState(() {
        _codeSent = true;
        _isLoading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Failed to send verification code. Please try again.';
        _isLoading = false;
      });
    }
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Code must be 6 digits');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      await ref
          .read(authProvider.notifier)
          .verifyEmail(_emailController.text.trim(), code);
    } catch (_) {
      setState(() {
        _error = 'Invalid or expired code. Please try again.';
        _isLoading = false;
      });
    }
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
      appBar: AppBar(title: Text(l10n.get('addEmailTitle'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(GrsSpacing.pagePad),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: GrsFadeIn(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 8),

                // ── Step indicator ──────────────────────────────────────────
                _StepIndicator(
                  step: _codeSent ? 2 : 1,
                  total: 2,
                  isDark: isDark,
                ),
                const SizedBox(height: 28),

                // ── Icon + heading ──────────────────────────────────────────
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
                          _codeSent
                              ? Icons.mark_email_unread_outlined
                              : Icons.mark_email_read_outlined,
                          size: 36,
                          color: primary,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        l10n.get('addEmailTitle'),
                        style: GrsTypography.headlineLarge(
                          color: ink,
                        ).copyWith(fontSize: 22),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _codeSent
                            ? 'Enter the 6-digit code sent to ${_emailController.text.trim()}'
                            : l10n.get('addEmailSubtitle'),
                        style: GrsTypography.bodyMedium(color: secondary),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // ── Error banner ────────────────────────────────────────────
                if (_error != null) ...[
                  _ErrorBanner(message: _error!, isDark: isDark),
                  const SizedBox(height: 16),
                ],

                // ── Step 1: Email ───────────────────────────────────────────
                if (!_codeSent) ...[
                  GrsTextField(
                    controller: _emailController,
                    label: l10n.get('emailLabel'),
                    hint: 'your.name@example.com',
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.email_outlined, size: 20),
                  ),
                  const SizedBox(height: 24),
                  GrsButton(
                    label: l10n.get('sendCodeButton'),
                    isLoading: _isLoading,
                    isFullWidth: true,
                    size: GrsButtonSize.large,
                    onPressed: _sendCode,
                  ),

                  // ── Step 2: Verification code ───────────────────────────────
                ] else ...[
                  GrsTextField(
                    controller: _codeController,
                    label: l10n.get('verificationCodeLabel'),
                    hint: '123456',
                    keyboardType: TextInputType.number,
                    prefixIcon: const Icon(Icons.pin_outlined, size: 20),
                  ),
                  const SizedBox(height: 24),
                  GrsButton(
                    label: l10n.get('verifyButton'),
                    isLoading: _isLoading,
                    isFullWidth: true,
                    size: GrsButtonSize.large,
                    onPressed: _verifyCode,
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: _isLoading ? null : _sendCode,
                      child: Text(
                        l10n.get('resendCodeButton'),
                        style: TextStyle(color: primary),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                // ── Skip ────────────────────────────────────────────────────
                GrsButton(
                  label: l10n.get('skipForNowButton'),
                  variant: GrsButtonVariant.outline,
                  isFullWidth: true,
                  onPressed: () =>
                      ref.read(authProvider.notifier).skipAddEmail(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────

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
