import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

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

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('addEmailTitle'))),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.mark_email_read_outlined,
                  size: 64,
                  color: GrsColors.primaryLight,
                ),
                const SizedBox(height: 16),
                Text(
                  l10n.get('addEmailTitle'),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: GrsColors.textPrimaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.get('addEmailSubtitle'),
                  style: const TextStyle(
                    fontSize: 14,
                    color: GrsColors.textSecondaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),

                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: GrsColors.syncRejectedBg,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: GrsColors.syncRejected),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                if (!_codeSent) ...[
                  GrsTextField(
                    controller: _emailController,
                    label: l10n.get('emailLabel'),
                    hint: 'your.name@example.com',
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 24),
                  GrsButton(
                    text: l10n.get('sendCodeButton'),
                    isLoading: _isLoading,
                    onPressed: _sendCode,
                  ),
                ] else ...[
                  GrsTextField(
                    controller: _codeController,
                    label: l10n.get('verificationCodeLabel'),
                    hint: '123456',
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 24),
                  GrsButton(
                    text: l10n.get('verifyButton'),
                    isLoading: _isLoading,
                    onPressed: _verifyCode,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _isLoading ? null : _sendCode,
                    child: Text(l10n.get('resendCodeButton')),
                  ),
                ],

                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () =>
                      ref.read(authProvider.notifier).skipAddEmail(),
                  child: Text(l10n.get('skipForNowButton')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
