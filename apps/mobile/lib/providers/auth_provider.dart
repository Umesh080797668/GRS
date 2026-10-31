import 'dart:convert';
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
  final bool isSessionExpiredOffline;

  const AuthState({
    required this.status,
    this.profile,
    this.errorMessage,
    this.isOffline = false,
    this.minVersionRequired,
    this.isSessionExpiredOffline = false,
  });

  factory AuthState.initial() => const AuthState(status: AuthStatus.initial);

  AuthState copyWith({
    AuthStatus? status,
    ProfileModel? profile,
    String? errorMessage,
    bool? isOffline,
    String? minVersionRequired,
    bool? isSessionExpiredOffline,
  }) {
    return AuthState(
      status: status ?? this.status,
      profile: profile ?? this.profile,
      errorMessage: errorMessage,
      isOffline: isOffline ?? this.isOffline,
      minVersionRequired: minVersionRequired ?? this.minVersionRequired,
      isSessionExpiredOffline:
          isSessionExpiredOffline ?? this.isSessionExpiredOffline,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final GrsApiClient _apiClient;
  final SecureStorageService _storage;
  final Ref? _ref;

  AuthNotifier({
    required GrsApiClient apiClient,
    required SecureStorageService storage,
    Ref? ref,
  }) : _apiClient = apiClient,
       _storage = storage,
       _ref = ref,
       super(AuthState.initial());

  bool _isJwtExpired(String? token) {
    if (token == null || token.trim().isEmpty) return true;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      final normalized = base64Url.normalize(parts[1]);
      final payloadString = utf8.decode(base64Url.decode(normalized));
      final map = jsonDecode(payloadString) as Map<String, dynamic>;
      final exp = map['exp'];
      if (exp is int) {
        final expiry = DateTime.fromMillisecondsSinceEpoch(
          exp * 1000,
          isUtc: true,
        );
        return DateTime.now().toUtc().isAfter(expiry);
      }
    } catch (_) {
      return true;
    }
    return false;
  }

  /// Checks saved session on app launch (Cold Start per M2.6)
  Future<void> checkColdStart() async {
    final results = await Future.wait([
      _storage.getActiveProfile(),
      _storage.getAccessToken(),
      _storage.getRefreshToken(),
    ]);
    final profile = results[0] as ProfileModel?;
    final accessToken = results[1] as String?;
    final refreshToken = results[2] as String?;

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

    _apiClient.setTokens(accessToken: accessToken, refreshToken: refreshToken);

    final isExpired = _isJwtExpired(accessToken);

    // Try refreshing or verifying online status in the background (fast timeout: 2.5s)
    try {
      if (refreshToken != null && refreshToken.trim().isNotEmpty) {
        final res = await _apiClient.refreshSession().timeout(
          const Duration(milliseconds: 2500),
        );
        await _storage.saveTokens(
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        );
        if (!res.profile.isActive) {
          state = AuthState(
            status: AuthStatus.deactivated,
            profile: res.profile,
          );
          return;
        }
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
          isSessionExpiredOffline: false,
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
      if (e is GrsApiException && e.isAccountDeactivated) {
        await _storage.clearTokens();
        state = AuthState(status: AuthStatus.deactivated, profile: profile);
        return;
      }
      // If server explicitly returned 401/400 while online, refresh was rejected
      // For network errors/timeouts, device is in offline mode
    }

    // Airplane-mode / Offline cold start (per Blueprint §7.6)
    // If the token has expired and there is no internet, the app shows a clear message
    // and still lets the agent keep recording data.
    final hasNoValidToken =
        accessToken == null || accessToken.trim().isEmpty || isExpired;

    state = AuthState(
      status: AuthStatus.authenticated,
      profile: profile,
      isOffline: true,
      isSessionExpiredOffline: hasNoValidToken,
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

      // User switch check (Build Plan §8.2 #7 & §12.4 #10)
      if (_ref != null) {
        try {
          final db = await _ref.read(databaseProvider.future);
          final lastUserId = await db.getMeta('last_user_id');
          if (lastUserId != null &&
              lastUserId.isNotEmpty &&
              lastUserId != res.profile.id) {
            final allClients = await db.getAllClients();
            final hasUnsynced = allClients.any(
              (c) => c['sync_status'] != 'synced',
            );
            if (hasUnsynced) {
              state = const AuthState(
                status: AuthStatus.unauthenticated,
                errorMessage: 'userSwitchBlockedUnsynced',
              );
              return;
            }
            // All previous user data was synced: wipe local database to preserve data privacy
            await db.wipeAllData();
          }
          await db.setMeta('last_user_id', res.profile.id);
        } catch (_) {}
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
      } else if (e.isAccountDeactivated) {
        state = const AuthState(
          status: AuthStatus.deactivated,
          errorMessage:
              'Your account has been deactivated. Contact your administrator.',
        );
      } else if (e.isPasswordExpired) {
        state = const AuthState(
          status: AuthStatus.unauthenticated,
          errorMessage:
              'Initial password has expired. Please contact your administrator to reset.',
        );
      } else if (e.isAccountLocked) {
        final retrySecs = e.retryAfterSeconds ?? 900;
        final mins = (retrySecs / 60).ceil();
        state = AuthState(
          status: AuthStatus.unauthenticated,
          errorMessage:
              'Account temporarily locked due to failed attempts. Try again in $mins minutes.',
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

  Future<void> logout({String deviceId = 'mobile-device'}) async {
    try {
      await _apiClient.logout(deviceId: deviceId);
    } catch (_) {}
    await _storage.clearTokens();
    await _storage.clearActiveProfile();
    _apiClient.clearTokens();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final storage = ref.watch(secureStorageProvider);
  return AuthNotifier(apiClient: apiClient, storage: storage, ref: ref);
});
