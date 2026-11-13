import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
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
  Timer? _cooldownTimer;
  int _cooldownSeconds = 0;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _startCooldown([int seconds = 60]) {
    _cooldownTimer?.cancel();
    if (!mounted) return;
    setState(() => _cooldownSeconds = seconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_cooldownSeconds <= 1) {
        timer.cancel();
        setState(() => _cooldownSeconds = 0);
      } else {
        setState(() => _cooldownSeconds--);
      }
    });
  }

  void _finish() {
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/home');
    }
  }

  String _mapErrorMessage(dynamic err, GrsL10n l10n) {
    if (err is GrsApiException) {
      if (err.code == 'EMAIL_COOLDOWN') {
        final secs =
            err.details['cooldownSeconds'] as num? ??
            err.retryAfterSeconds ??
            60;
        return 'Please wait ${secs.toInt()} seconds before requesting a new code.';
      }
      if (err.code == 'EMAIL_ALREADY_IN_USE') {
        return 'This email address is already in use by another account.';
      }
      if (err.code == 'TOO_MANY_ATTEMPTS') {
        return 'Too many incorrect attempts. Please request a new code.';
      }
      if (err.code == 'CODE_EXPIRED_OR_NOT_FOUND') {
        return 'Verification code has expired. Please request a new code.';
      }
      if (err.code == 'INVALID_CODE') {
        final remaining = err.details['remainingAttempts'];
        if (remaining != null) {
          return 'Incorrect verification code. $remaining attempts remaining.';
        }
        return 'Incorrect verification code. Please try again.';
      }
      if (err.messageKey.isNotEmpty && err.messageKey != 'null') {
        final translated = l10n.translate(err.messageKey);
        if (translated != err.messageKey) {
          return translated;
        }
      }
    }
    return 'An error occurred. Please try again.';
  }

  Future<void> _sendCode() async {
    if (_cooldownSeconds > 0) return;
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
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _isLoading = false;
      });
      _startCooldown(60);
    } catch (e) {
      if (!mounted) return;
      if (e is GrsApiException && e.code == 'EMAIL_COOLDOWN') {
        final secs =
            e.details['cooldownSeconds'] as num? ?? e.retryAfterSeconds ?? 60;
        _startCooldown(secs.toInt());
      }
      final l10n = GrsL10n.of(context);
      setState(() {
        _error = _mapErrorMessage(e, l10n);
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
      if (!mounted) return;
      setState(() => _isLoading = false);
      _finish();
    } catch (e) {
      if (!mounted) return;
      final l10n = GrsL10n.of(context);
      setState(() {
        _error = _mapErrorMessage(e, l10n);
        _isLoading = false;
      });
    }
  }

  void _changeEmailAddress() {
    _cooldownTimer?.cancel();
    setState(() {
      _codeSent = false;
      _cooldownSeconds = 0;
      _error = null;
      _codeController.clear();
    });
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: _isLoading ? null : _changeEmailAddress,
                        child: Text(
                          l10n.get('changeEmailButton'),
                          style: TextStyle(color: secondary),
                        ),
                      ),
                      TextButton(
                        onPressed: (_isLoading || _cooldownSeconds > 0)
                            ? null
                            : _sendCode,
                        child: Text(
                          _cooldownSeconds > 0
                              ? '${l10n.get('resendCodeButton')} (${_cooldownSeconds}s)'
                              : l10n.get('resendCodeButton'),
                          style: TextStyle(
                            color: _cooldownSeconds > 0 ? secondary : primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],

                const SizedBox(height: 16),

                // ── Skip ────────────────────────────────────────────────────
                GrsButton(
                  label: l10n.get('skipForNowButton'),
                  variant: GrsButtonVariant.outline,
                  isFullWidth: true,
                  onPressed: () {
                    ref.read(authProvider.notifier).skipAddEmail();
                    _finish();
                  },
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
