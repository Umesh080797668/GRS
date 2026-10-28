import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:grs_core/grs_core.dart';

/// Service managing hardware-backed encryption keys and sensitive session tokens
/// via Android Keystore / iOS Keychain.
class SecureStorageService {
  final FlutterSecureStorage _storage;

  static const String _keyDbCipher = 'grs_db_cipher_key_v1';
  static const String _keyAccessToken = 'grs_access_token';
  static const String _keyRefreshToken = 'grs_refresh_token';
  static const String _keyActiveProfile = 'grs_active_profile';
  static const String _keyPreferredLanguage = 'grs_pref_lang';

  SecureStorageService({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  /// Retrieves or generates a cryptographically random 32-byte hex encryption key.
  Future<String> getOrCreateDatabaseKey() async {
    final existing = await _storage.read(key: _keyDbCipher);
    if (existing != null && existing.length == 64) {
      return existing;
    }

    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    final hexKey = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

    await _storage.write(key: _keyDbCipher, value: hexKey);
    return hexKey;
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _keyAccessToken, value: accessToken);
    await _storage.write(key: _keyRefreshToken, value: refreshToken);
  }

  Future<String?> getAccessToken() async =>
      await _storage.read(key: _keyAccessToken);
  Future<String?> getRefreshToken() async =>
      await _storage.read(key: _keyRefreshToken);

  Future<void> clearTokens() async {
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
  }

  Future<void> saveActiveProfile(ProfileModel profile) async {
    final jsonStr = jsonEncode(profile.toJson());
    await _storage.write(key: _keyActiveProfile, value: jsonStr);
  }

  Future<ProfileModel?> getActiveProfile() async {
    final jsonStr = await _storage.read(key: _keyActiveProfile);
    if (jsonStr == null) return null;
    try {
      final map = jsonDecode(jsonStr) as Map<String, dynamic>;
      return ProfileModel.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  Future<void> clearActiveProfile() async {
    await _storage.delete(key: _keyActiveProfile);
  }

  Future<void> savePreferredLanguage(String lang) async {
    await _storage.write(key: _keyPreferredLanguage, value: lang);
  }

  Future<String> getPreferredLanguage() async {
    final lang = await _storage.read(key: _keyPreferredLanguage);
    return (lang == 'si' || lang == 'ta' || lang == 'en') ? lang! : 'en';
  }

  /// Wipes all sensitive keys on user switch (Invariant 8.2 #7)
  Future<void> wipeAll() async {
    await _storage.deleteAll();
  }
}
