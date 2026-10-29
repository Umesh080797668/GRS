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

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _idController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _idController.dispose();
    _passwordController.dispose();
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Global Research & Survey App'),
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
                  const SizedBox(height: 16),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.asset(
                      'assets/images/app_logo.png',
                      width: 72,
                      height: 72,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.assignment_ind_outlined,
                        size: 64,
                        color: GrsColors.primaryLight,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    l10n.get('loginTitle'),
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: GrsColors.textPrimaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    l10n.get('loginSubtitle'),
                    style: const TextStyle(
                      fontSize: 15,
                      color: GrsColors.textSecondaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  if (authState.errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: GrsColors.syncRejectedBg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: GrsColors.syncRejected),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: GrsColors.syncRejected,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              authState.errorMessage!,
                              style: const TextStyle(
                                color: GrsColors.syncRejected,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],

                  GrsTextField(
                    controller: _idController,
                    label: l10n.get('identifierLabel'),
                    hint: l10n.get('identifierHint'),
                    textInputAction: TextInputAction.next,
                    prefixIcon: const Icon(Icons.person_outline),
                    validator: (val) {
                      if (val == null || val.trim().isEmpty) {
                        return 'Please enter your GRS ID or Email';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  GrsTextField(
                    controller: _passwordController,
                    label: l10n.get('passwordLabel'),
                    hint: l10n.get('passwordHint'),
                    isPassword: true,
                    textInputAction: TextInputAction.done,
                    onEditingComplete: _submit,
                    prefixIcon: const Icon(Icons.lock_outline),
                    validator: (val) {
                      if (val == null || val.isEmpty) {
                        return 'Please enter your password';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),

                  GrsButton(
                    text: l10n.get('signInButton'),
                    isLoading: isLoading,
                    onPressed: _submit,
                  ),
                  const SizedBox(height: 16),

                  TextButton(
                    onPressed: () => context.push('/forgot-password'),
                    child: Text(
                      l10n.get('forgotPasswordTitle'),
                      style: const TextStyle(
                        fontSize: 14,
                        color: GrsColors.secondaryLight,
                        fontWeight: FontWeight.w600,
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
