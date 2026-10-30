import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/local/secure_storage_service.dart';
import 'database_provider.dart';

final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((
  ref,
) {
  final storage = ref.watch(secureStorageProvider);
  return ThemeModeNotifier(storage);
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final SecureStorageService _storage;

  ThemeModeNotifier(this._storage) : super(ThemeMode.system) {
    _loadSavedTheme();
  }

  Future<void> _loadSavedTheme() async {
    try {
      final savedMode = await _storage.getThemeMode();
      state = savedMode;
    } catch (_) {}
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.saveThemeMode(mode);
    } catch (_) {}
  }

  Future<void> toggleTheme({required bool isCurrentlyDark}) async {
    final nextMode = isCurrentlyDark ? ThemeMode.light : ThemeMode.dark;
    await setThemeMode(nextMode);
  }
}
