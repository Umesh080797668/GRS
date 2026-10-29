import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import '../data/local/secure_storage_service.dart';
import 'api_client_provider.dart';
import 'database_provider.dart';

enum AuthStatus {
  initial,
  unauthenticated,
  authenticating,
  mustChangePassword,
  addEmailOptional,
  authenticated,
  deactivated,
  versionGate,
}

class AuthState {
  final AuthStatus status;
  final ProfileModel? profile;
  final String? errorMessage;
  final bool isOffline;
  final String? minVersionRequired;

  const AuthState({
    required this.status,
    this.profile,
    this.errorMessage,
    this.isOffline = false,
    this.minVersionRequired,
  });

  factory AuthState.initial() => const AuthState(status: AuthStatus.initial);

  AuthState copyWith({
    AuthStatus? status,
    ProfileModel? profile,
    String? errorMessage,
    bool? isOffline,
    String? minVersionRequired,
  }) {
    return AuthState(
      status: status ?? this.status,
      profile: profile ?? this.profile,
      errorMessage: errorMessage,
      isOffline: isOffline ?? this.isOffline,
      minVersionRequired: minVersionRequired ?? this.minVersionRequired,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final GrsApiClient _apiClient;
  final SecureStorageService _storage;

  AuthNotifier({
    required GrsApiClient apiClient,
    required SecureStorageService storage,
  }) : _apiClient = apiClient,
       _storage = storage,
       super(AuthState.initial());

  /// Checks saved session on app launch (Cold Start per M2.6)
  Future<void> checkColdStart() async {
    final profile = await _storage.getActiveProfile();
    final accessToken = await _storage.getAccessToken();
    final refreshToken = await _storage.getRefreshToken();

    if (profile == null) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    if (!profile.isActive) {
      state = AuthState(status: AuthStatus.deactivated, profile: profile);
      return;
    }

    // Forced password change cannot be bypassed via app restart (Invariant 8.2)
    if (profile.mustChangePassword) {
      _apiClient.setTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
      state = AuthState(
        status: AuthStatus.mustChangePassword,
        profile: profile,
      );
      return;
    }

    // Missing or cleared tokens (e.g. after logout) must never authenticate offline
    final hasNoTokens =
        (accessToken == null || accessToken.trim().isEmpty) &&
        (refreshToken == null || refreshToken.trim().isEmpty);
    if (hasNoTokens) {
      await _storage.clearTokens();
      await _storage.clearActiveProfile();
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    _apiClient.setTokens(accessToken: accessToken, refreshToken: refreshToken);

    // Try refreshing or verifying online status
    try {
      if (refreshToken != null && refreshToken.trim().isNotEmpty) {
        final res = await _apiClient.refreshSession();
        await _storage.saveTokens(
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        );
        if (res.profile.mustChangePassword) {
          state = AuthState(
            status: AuthStatus.mustChangePassword,
            profile: res.profile,
          );
          return;
        }
        state = AuthState(
          status: AuthStatus.authenticated,
          profile: res.profile,
          isOffline: false,
        );
        return;
      }
    } catch (e) {
      if (e is GrsApiException && e.isVersionGate) {
        state = AuthState(
          status: AuthStatus.versionGate,
          minVersionRequired: e.details['min_version'] as String? ?? '1.0.0',
        );
        return;
      }
      if (e is GrsApiException && (e.isUnauthorized || e.statusCode == 400)) {
        // Token invalid, revoked, malformed, or rejected
        await _storage.clearTokens();
        await _storage.clearActiveProfile();
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }
    }

    // Airplane-mode / Offline cold start with valid saved credentials
    state = AuthState(
      status: AuthStatus.authenticated,
      profile: profile,
      isOffline: true,
    );
  }

  /// Sign in flow (M2.5) with uniform failure response (Invariant 14)
  Future<void> login(
    String identifier,
    String password, {
    String deviceId = 'mobile-device',
  }) async {
    state = state.copyWith(
      status: AuthStatus.authenticating,
      errorMessage: null,
    );

    try {
      final res = await _apiClient.login(
        LoginRequest(
          identifier: identifier,
          password: password,
          deviceId: deviceId,
        ),
      );

      if (!res.profile.isActive) {
        state = AuthState(status: AuthStatus.deactivated, profile: res.profile);
        return;
      }

      await _storage.saveTokens(
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      );
      await _storage.saveActiveProfile(res.profile);

      if (res.mustChangePassword) {
        state = AuthState(
          status: AuthStatus.mustChangePassword,
          profile: res.profile,
        );
      } else {
        state = AuthState(
          status: AuthStatus.authenticated,
          profile: res.profile,
          isOffline: false,
        );
      }
    } on GrsApiException catch (e) {
      if (e.isVersionGate) {
        state = AuthState(
          status: AuthStatus.versionGate,
          minVersionRequired: e.details['min_version'] as String? ?? '1.0.0',
        );
      } else if (e.isUnauthorized || e.isNotFound) {
        // Invariant 14: Uniform error message
        state = const AuthState(
          status: AuthStatus.unauthenticated,
          errorMessage: 'Invalid user code, email, or password',
        );
      } else {
        state = AuthState(
          status: AuthStatus.unauthenticated,
          errorMessage: e.messageKey,
        );
      }
    } catch (e, st) {
      // ignore: avoid_print
      print('AuthNotifier.login unexpected error: $e\n$st');
      state = const AuthState(
        status: AuthStatus.unauthenticated,
        errorMessage: 'Connection failed. Please check network.',
      );
    }
  }

  /// Forced password change (M2.5)
  Future<void> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    state = state.copyWith(
      status: AuthStatus.authenticating,
      errorMessage: null,
    );

    try {
      final res = await _apiClient.changePassword(
        ChangePasswordRequest(
          currentPassword: currentPassword,
          newPassword: newPassword,
        ),
      );

      await _storage.saveTokens(
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      );
      await _storage.saveActiveProfile(res.profile);

      // Successfully updated password -> transition to optional Add Email screen
      state = AuthState(
        status: AuthStatus.addEmailOptional,
        profile: res.profile,
      );
    } on GrsApiException catch (e) {
      state = state.copyWith(
        status: AuthStatus.mustChangePassword,
        errorMessage: e.messageKey,
      );
    } catch (_) {
      state = state.copyWith(
        status: AuthStatus.mustChangePassword,
        errorMessage: 'Failed to update password. Try again.',
      );
    }
  }

  /// Optional Add Email (M2.5)
  Future<void> addEmail(String email) async {
    try {
      await _apiClient.addEmail(email);
    } on GrsApiException catch (e) {
      state = state.copyWith(errorMessage: e.messageKey);
      rethrow;
    }
  }

  /// Optional Verify Email code (M2.5)
  Future<void> verifyEmail(String email, String code) async {
    try {
      await _apiClient.verifyEmail(email, code);
      if (state.profile != null) {
        final updated = ProfileModel(
          id: state.profile!.id,
          userCode: state.profile!.userCode,
          email: email.trim().toLowerCase(),
          role: state.profile!.role,
          fullName: state.profile!.fullName,
          phoneE164: state.profile!.phoneE164,
          preferredLanguage: state.profile!.preferredLanguage,
          districtId: state.profile!.districtId,
          dsId: state.profile!.dsId,
          gnId: state.profile!.gnId,
          teamId: state.profile!.teamId,
          isActive: state.profile!.isActive,
          mustChangePassword: false,
        );
        await _storage.saveActiveProfile(updated);
        state = AuthState(status: AuthStatus.authenticated, profile: updated);
      } else {
        state = state.copyWith(status: AuthStatus.authenticated);
      }
    } on GrsApiException catch (e) {
      state = state.copyWith(errorMessage: e.messageKey);
      rethrow;
    }
  }

  void skipAddEmail() {
    state = AuthState(status: AuthStatus.authenticated, profile: state.profile);
  }

  Future<void> logout() async {
    final profileId = state.profile?.id;
    try {
      await _apiClient.logout();
    } catch (_) {}
    await _storage.clearTokens();
    await _storage.clearActiveProfile();
    _apiClient.clearTokens();
    if (profileId != null) {
      await wipeUserDatabase(userId: profileId, storage: _storage);
    } else {
      await wipeUserDatabase(storage: _storage);
    }
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final storage = ref.watch(secureStorageProvider);
  return AuthNotifier(apiClient: apiClient, storage: storage);
});
