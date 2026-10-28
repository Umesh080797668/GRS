import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';
import '../../providers/auth_provider.dart';

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

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('changePasswordTitle'))),
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
                    l10n.get('changePasswordTitle'),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: GrsColors.textPrimaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.get('changePasswordSubtitle'),
                    style: const TextStyle(
                      fontSize: 14,
                      color: GrsColors.textSecondaryLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),

                  if (authState.errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: GrsColors.syncRejectedBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        authState.errorMessage!,
                        style: const TextStyle(color: GrsColors.syncRejected),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  GrsTextField(
                    controller: _currentPasswordController,
                    label: l10n.get('currentPasswordLabel'),
                    isPassword: true,
                    validator: (val) {
                      if (val == null || val.isEmpty) {
                        return 'Please enter current password';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  GrsTextField(
                    controller: _newPasswordController,
                    label: l10n.get('newPasswordLabel'),
                    isPassword: true,
                    helperText:
                        'Must be at least 8 characters with upper, lower, number, and special character',
                    validator: (val) {
                      final result = GrsValidators.validatePassword(val);
                      if (!result.isValid) {
                        return result.error ??
                            'Password does not meet security requirements';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  GrsTextField(
                    controller: _confirmPasswordController,
                    label: l10n.get('confirmPasswordLabel'),
                    isPassword: true,
                    validator: (val) {
                      if (val != _newPasswordController.text) {
                        return l10n.get('passwordMismatchError');
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),

                  GrsButton(
                    text: l10n.get('updatePasswordButton'),
                    isLoading: isLoading,
                    onPressed: _submit,
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
