import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_core/grs_core.dart';
import '../data/local/secure_storage_service.dart';
import 'api_client_provider.dart';
import 'database_provider.dart';

const Set<String> _mobileAllowedRoles = {'cdc_secretary', 'team_member'};
const String _mobileRestrictedMessage =
    'This role is web-only and does not have mobile app access.';

bool isMobileAllowedRole(String? role) =>
    role != null && _mobileAllowedRoles.contains(role);

enum AuthStatus {
  initial,
  unauthenticated,
  authenticating,
  mustChangePassword,
  addEmailOptional,
  authenticated,
  deactivated,
  versionGate,
  platformLocked,
}

class AuthState {
  final AuthStatus status;
  final ProfileModel? profile;
  final String? errorMessage;
  final bool isOffline;
  final String? minVersionRequired;
  final bool isSessionExpiredOffline;
  final String? lockReason;

  const AuthState({
    required this.status,
    this.profile,
    this.errorMessage,
    this.isOffline = false,
    this.minVersionRequired,
    this.isSessionExpiredOffline = false,
    this.lockReason,
  });

  ProfileModel? get user => profile;

  factory AuthState.initial() => const AuthState(status: AuthStatus.initial);

  AuthState copyWith({
    AuthStatus? status,
    ProfileModel? profile,
    String? errorMessage,
    bool? isOffline,
    String? minVersionRequired,
    bool? isSessionExpiredOffline,
    String? lockReason,
  }) {
    return AuthState(
      status: status ?? this.status,
      profile: profile ?? this.profile,
      errorMessage: errorMessage,
      isOffline: isOffline ?? this.isOffline,
      minVersionRequired: minVersionRequired ?? this.minVersionRequired,
      isSessionExpiredOffline:
          isSessionExpiredOffline ?? this.isSessionExpiredOffline,
      lockReason: lockReason ?? this.lockReason,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final GrsApiClient _apiClient;
  final SecureStorageService _storage;

  AuthNotifier({
    required GrsApiClient apiClient,
    required SecureStorageService storage,
    Ref? ref,
    AuthState? initialState,
  }) : _apiClient = apiClient,
       _storage = storage,
       super(initialState ?? AuthState.initial());

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
    final List<Object?> results;
    try {
      results = await Future.wait<Object?>([
        _storage.getActiveProfile(),
        _storage.getAccessToken(),
        _storage.getRefreshToken(),
      ]);
    } catch (_) {
      // Secure storage unreadable (e.g. Android Keystore key lost after a restore or
      // reinstall). The session cannot be recovered: start clean at the sign-in screen
      // instead of hanging on the splash screen.
      try {
        await _storage.wipeAll();
      } catch (_) {}
      _apiClient.clearTokens();
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
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

    // Profile exists but the session tokens are gone (cleared, reinstall leftovers):
    // there is nothing to refresh, so give the user a fresh sign-in instead of a
    // permanent "offline" state that can never recover.
    if ((refreshToken == null || refreshToken.trim().isEmpty) &&
        (accessToken == null || accessToken.trim().isEmpty) &&
        !profile.mustChangePassword) {
      await _endSession(errorMessage: 'sessionEnded');
      return;
    }

    if (!isMobileAllowedRole(profile.role)) {
      await _rejectMobileRestricted();
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

    // Try refreshing or verifying online status in the background (timeout: 8s for cellular/2G)
    try {
      if (refreshToken != null && refreshToken.trim().isNotEmpty) {
        final res = await _apiClient.refreshSession().timeout(
          const Duration(milliseconds: 8000),
        );
        if (!isMobileAllowedRole(res.profile.role)) {
          await _rejectMobileRestricted();
          return;
        }

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
      if (e is GrsApiException && e.isPlatformLocked) {
        state = AuthState(
          status: AuthStatus.platformLocked,
          profile: profile,
          lockReason: e.details['reason'] as String?,
        );
        return;
      }
      if (e is GrsApiException && e.isAccountDeactivated) {
        await _storage.clearTokens();
        state = AuthState(status: AuthStatus.deactivated, profile: profile);
        return;
      }
      if (e is GrsApiException && e.isMobileRestricted) {
        await _rejectMobileRestricted();
        return;
      }
      // The server explicitly rejected the refresh token (logged out elsewhere, user
      // deleted, password changed, token revoked): the session is over. Local unsynced
      // records stay on the device; the user simply signs in again.
      if (e is GrsApiException && e.isUnauthorized) {
        await _endSession(errorMessage: 'sessionEnded');
        return;
      }
      // Network errors, timeouts and 5xx: stay signed in and continue in offline mode.
    }

    // Airplane-mode / Offline cold start (per Blueprint §7.6)
    // Reject cached web-only roles even offline
    if (!isMobileAllowedRole(profile.role)) {
      await _rejectMobileRestricted();
      return;
    }

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

      if (!isMobileAllowedRole(res.profile.role)) {
        await _rejectMobileRestricted();
        return;
      }

      if (!res.profile.isActive) {
        state = AuthState(status: AuthStatus.deactivated, profile: res.profile);
        return;
      }

      // User switch check (Build Plan §8.2 #7 & §12.4 #10)
      final lastUserId = await _storage.getLastUserId();
      if (lastUserId != null &&
          lastUserId.isNotEmpty &&
          lastUserId != res.profile.id) {
        final hasUnsynced = await hasUnsyncedRecordsForUser(
          userId: lastUserId,
          storage: _storage,
        );
        if (hasUnsynced) {
          state = const AuthState(
            status: AuthStatus.unauthenticated,
            errorMessage: 'userSwitchBlockedUnsynced',
          );
          return;
        }
        // All previous user data was synced: wipe previous user's database and key
        await wipeUserDatabase(userId: lastUserId, storage: _storage);
      }
      await _storage.saveLastUserId(res.profile.id);

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
      } else if (e.isPlatformLocked) {
        state = AuthState(
          status: AuthStatus.platformLocked,
          lockReason: e.details['reason'] as String?,
        );
      } else if (e.isAccountDeactivated) {
        state = const AuthState(
          status: AuthStatus.deactivated,
          errorMessage:
              'Your account has been deactivated. Contact your administrator.',
        );
      } else if (e.isMobileRestricted) {
        state = const AuthState(
          status: AuthStatus.unauthenticated,
          errorMessage: _mobileRestrictedMessage,
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

      if (!isMobileAllowedRole(res.profile.role)) {
        await _rejectMobileRestricted();
        return;
      }

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

  Future<void> switchArea(
    String gnId, {
    String deviceId = 'mobile-device',
  }) async {
    try {
      final res = await _apiClient.switchArea(gnId, deviceId: deviceId);
      if (!isMobileAllowedRole(res.profile.role)) {
        await _rejectMobileRestricted();
        return;
      }

      await _storage.saveTokens(
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      );
      await _storage.saveActiveProfile(res.profile);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        profile: res.profile,
      );
    } catch (e) {
      rethrow;
    }
  }

  void skipAddEmail() {
    state = AuthState(status: AuthStatus.authenticated, profile: state.profile);
  }

  void setDeactivatedState() {
    state = AuthState(
      status: AuthStatus.deactivated,
      profile: state.profile,
      errorMessage:
          'Your account has been deactivated. Contact your administrator.',
    );
  }

  /// Clears the stored session (tokens + active profile) and returns to sign-in.
  /// Local records are intentionally kept so unsynced work is never lost.
  Future<void> _endSession({String? errorMessage}) async {
    try {
      await _storage.clearTokens();
      await _storage.clearActiveProfile();
    } catch (_) {}
    _apiClient.clearTokens();
    state = AuthState(
      status: AuthStatus.unauthenticated,
      errorMessage: errorMessage,
    );
  }

  /// Called by the API client when the server definitively rejects the session during a
  /// token refresh. Mobile sessions have no timeout, so this only happens for real reasons:
  /// logged out elsewhere, account deleted/deactivated, password changed or token theft.
  Future<void> handleSessionInvalidated(GrsApiException error) async {
    // Cold start and login handle their own rejections
    if (state.status == AuthStatus.initial ||
        state.status == AuthStatus.unauthenticated ||
        state.status == AuthStatus.authenticating ||
        state.status == AuthStatus.versionGate) {
      return;
    }

    if (error.isAccountDeactivated) {
      try {
        await _storage.clearTokens();
      } catch (_) {}
      _apiClient.clearTokens();
      state = AuthState(
        status: AuthStatus.deactivated,
        profile: state.profile,
        errorMessage:
            'Your account has been deactivated. Contact your administrator.',
      );
      return;
    }
    if (error.isMobileRestricted) {
      await _rejectMobileRestricted();
      return;
    }
    if (error.isPlatformLocked) {
      state = AuthState(
        status: AuthStatus.platformLocked,
        profile: state.profile,
        lockReason: error.details['reason'] as String?,
      );
      return;
    }
    await _endSession(errorMessage: 'sessionEnded');
  }

  Future<void> _rejectMobileRestricted() async {
    await _storage.clearTokens();
    await _storage.clearActiveProfile();
    _apiClient.clearTokens();
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      errorMessage: _mobileRestrictedMessage,
    );
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

final StateNotifierProvider<AuthNotifier, AuthState> authProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
      final apiClient = ref.watch(apiClientProvider);
      final storage = ref.watch(secureStorageProvider);
      return AuthNotifier(apiClient: apiClient, storage: storage, ref: ref);
    });
