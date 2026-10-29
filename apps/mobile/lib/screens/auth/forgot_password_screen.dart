import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/api_client_provider.dart';

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
            backgroundColor: GrsColors.primaryLight,
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
          _errorMessage =
              'An unexpected network error occurred. Please try again.';
        });
      }
    }
  }

  Future<void> _submitReset() async {
    final email = _emailController.text.trim();
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
        email: email,
        code: code,
        newPassword: newPassword,
      );

      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(GrsL10n.of(context).get('resetSuccessMessage')),
            backgroundColor: GrsColors.syncSynced,
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
          _errorMessage =
              'An unexpected network error occurred. Please try again.';
        });
      }
    }
  }

  void _showContactAdminDialog(BuildContext context, GrsL10n l10n) {
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

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _isStep2
              ? l10n.get('resetPasswordTitle')
              : l10n.get('forgotPasswordTitle'),
        ),
        actions: const [LanguagePickerWidget()],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.lock_reset_rounded,
                    size: 64,
                    color: GrsColors.primaryLight,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _isStep2
                        ? l10n.get('resetPasswordTitle')
                        : l10n.get('forgotPasswordTitle'),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: GrsColors.textPrimaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _isStep2
                        ? l10n.get('resetPasswordPrompt')
                        : l10n.get('forgotPasswordPrompt'),
                    style: const TextStyle(
                      fontSize: 14,
                      color: GrsColors.textSecondaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),

                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: GrsColors.syncRejectedBg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: GrsColors.syncRejected),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: GrsColors.syncRejected),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  if (!_isStep2) ...[
                    GrsTextField(
                      controller: _emailController,
                      label: l10n.get('emailLabel'),
                      hint: 'name@example.com',
                      keyboardType: TextInputType.emailAddress,
                      enabled: !_isLoading,
                    ),
                    const SizedBox(height: 24),
                    GrsButton(
                      text: l10n.get('sendResetButton'),
                      isLoading: _isLoading,
                      onPressed: _sendResetCode,
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: () => _showContactAdminDialog(context, l10n),
                      child: Text(l10n.get('askAdminButton')),
                    ),
                  ] else ...[
                    GrsTextField(
                      controller: _codeController,
                      label: l10n.get('verificationCodeLabel'),
                      hint: '123456',
                      keyboardType: TextInputType.number,
                      enabled: !_isLoading,
                    ),
                    const SizedBox(height: 16),
                    GrsTextField(
                      controller: _passwordController,
                      label: l10n.get('newPasswordLabel'),
                      isPassword: true,
                      enabled: !_isLoading,
                    ),
                    const SizedBox(height: 24),
                    GrsButton(
                      text: l10n.get('resetPasswordButton'),
                      isLoading: _isLoading,
                      onPressed: _submitReset,
                    ),
                  ],

                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => context.go('/login'),
                    child: Text(l10n.get('cancel')),
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
