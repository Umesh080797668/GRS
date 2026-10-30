import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _idController = TextEditingController();
  final _passwordController = TextEditingController();
  late final AnimationController _bannerCtrl;
  late final Animation<double> _bannerOpacity;

  @override
  void initState() {
    super.initState();
    _bannerCtrl = AnimationController(
      vsync: this,
      duration: GrsMotion.durationSlow,
    );
    _bannerOpacity = CurvedAnimation(
      parent: _bannerCtrl,
      curve: GrsMotion.curveEnter,
    );
    // Small initial delay so the splash frame settles first.
    Future.delayed(GrsMotion.durationInitialDelay, () {
      if (mounted) _bannerCtrl.forward();
    });
  }

  @override
  void dispose() {
    _idController.dispose();
    _passwordController.dispose();
    _bannerCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      ref
          .read(authProvider.notifier)
          .login(_idController.text.trim(), _passwordController.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final l10n = GrsL10n.of(context);
    final isLoading = authState.status == AuthStatus.authenticating;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bg = isDark ? GrsColors.backgroundDark : GrsColors.backgroundLight;
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    final primaryColor = isDark
        ? GrsColors.primaryDark
        : GrsColors.primaryLight;

    return Scaffold(
      backgroundColor: bg,
      // No AppBar on the login screen — the page is self-contained.
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.zero,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.top,
            ),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Top brand panel ────────────────────────────────────────
                  FadeTransition(
                    opacity: _bannerOpacity,
                    child: Container(
                      color: isDark
                          ? GrsColors.heroBannerBgDark
                          : GrsColors.heroBannerBg,
                      padding: const EdgeInsets.fromLTRB(28, 48, 28, 40),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // App icon / logo mark
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.assignment_ind_outlined,
                              size: 30,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 24),
                          Text(
                            'GRS Mobile',
                            style: GrsTypography.displayLarge(
                              color: Colors.white,
                            ).copyWith(fontSize: 28, letterSpacing: -0.6),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Global Research & Survey System',
                            style: GrsTypography.bodyMedium(
                              color: Colors.white.withValues(alpha: 0.75),
                            ),
                          ),
                          // Language picker in header row
                          const SizedBox(height: 20),
                          Row(children: [const LanguagePickerWidget()]),
                        ],
                      ),
                    ),
                  ),

                  // ── Form card area ─────────────────────────────────────────
                  Expanded(
                    child: Container(
                      color: bg,
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 440),
                            child: Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // ── Section heading ──────────────────────
                                  GrsRiseIn(
                                    delay: const Duration(milliseconds: 160),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          l10n.get('loginTitle'),
                                          style: GrsTypography.headlineLarge(
                                            color: ink,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          l10n.get('loginSubtitle'),
                                          style: GrsTypography.bodyMedium(
                                            color: secondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 28),

                                  // ── Error banner ─────────────────────────
                                  if (authState.errorMessage != null) ...[
                                    GrsRiseIn(
                                      child: _ErrorBanner(
                                        message: authState.errorMessage!,
                                      ),
                                    ),
                                    const SizedBox(height: 20),
                                  ],

                                  // ── Fields ───────────────────────────────
                                  GrsRiseIn(
                                    delay: const Duration(milliseconds: 220),
                                    child: GrsTextField(
                                      controller: _idController,
                                      label: l10n.get('identifierLabel'),
                                      hint: l10n.get('identifierHint'),
                                      textInputAction: TextInputAction.next,
                                      prefixIcon: const Icon(
                                        Icons.badge_outlined,
                                        size: 20,
                                      ),
                                      validator: (val) {
                                        if (val == null || val.trim().isEmpty) {
                                          return 'Please enter your GRS ID or Email';
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                  const SizedBox(height: 14),

                                  GrsRiseIn(
                                    delay: const Duration(milliseconds: 280),
                                    child: GrsTextField(
                                      controller: _passwordController,
                                      label: l10n.get('passwordLabel'),
                                      hint: l10n.get('passwordHint'),
                                      isPassword: true,
                                      textInputAction: TextInputAction.done,
                                      onEditingComplete: _submit,
                                      prefixIcon: const Icon(
                                        Icons.lock_outline_rounded,
                                        size: 20,
                                      ),
                                      validator: (val) {
                                        if (val == null || val.isEmpty) {
                                          return 'Please enter your password';
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                  const SizedBox(height: 28),

                                  // ── Primary CTA ──────────────────────────
                                  GrsRiseIn(
                                    delay: const Duration(milliseconds: 340),
                                    child: GrsButton(
                                      text: l10n.get('signInButton'),
                                      isLoading: isLoading,
                                      isFullWidth: true,
                                      size: GrsButtonSize.large,
                                      onPressed: _submit,
                                    ),
                                  ),
                                  const SizedBox(height: 14),

                                  // ── Forgot password ──────────────────────
                                  GrsFadeIn(
                                    delay: const Duration(milliseconds: 400),
                                    child: Center(
                                      child: TextButton(
                                        onPressed: () =>
                                            context.push('/forgot-password'),
                                        child: Text(
                                          l10n.get('forgotPasswordTitle'),
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                            color: primaryColor,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  const Spacer(),

                                  // ── Footer ───────────────────────────────
                                  GrsFadeIn(
                                    delay: const Duration(milliseconds: 500),
                                    child: Center(
                                      child: Text(
                                        'Global Research & Survey Program',
                                        style: GrsTypography.labelSmall(
                                          color: secondary,
                                        ),
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
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

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: GrsColors.syncRejectedBg,
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
