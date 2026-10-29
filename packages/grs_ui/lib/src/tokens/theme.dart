import 'package:flutter/material.dart';
import 'colors.dart';
import 'typography.dart';

class GrsTheme {
  GrsTheme._();

  static ThemeData lightTheme({String languageCode = 'en'}) {
    final textTheme = GrsTypography.textTheme(
      languageCode: languageCode,
      isDark: false,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: GrsColors.primaryLight,
        onPrimary: GrsColors.onPrimaryLight,
        primaryContainer: GrsColors.primaryContainerLight,
        onPrimaryContainer: GrsColors.onPrimaryContainerLight,
        secondary: GrsColors.secondaryLight,
        onSecondary: GrsColors.onSecondaryLight,
        surface: GrsColors.surfaceLight,
        onSurface: GrsColors.textPrimaryLight,
        surfaceContainerHighest: GrsColors.surfaceVariantLight,
        outline: GrsColors.outlineLight,
        error: GrsColors.syncRejected,
        onError: Colors.white,
      ),
      scaffoldBackgroundColor: GrsColors.backgroundLight,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: GrsColors.textPrimaryLight,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        iconTheme: const IconThemeData(color: GrsColors.textPrimaryLight),
      ),
      cardTheme: CardThemeData(
        color: GrsColors.surfaceLight,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: GrsColors.outlineLight, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GrsColors.surfaceVariantLight,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: GrsColors.outlineLight, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: GrsColors.primaryLight, width: 2),
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textTertiaryLight,
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: BorderSide.none,
        selectedColor: GrsColors.primaryContainerLight,
        backgroundColor: GrsColors.surfaceVariantLight,
        labelStyle: textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          backgroundColor: GrsColors.primaryLight,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(88, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          side: const BorderSide(color: GrsColors.outlineLight, width: 1.5),
        ),
      ),
    );
  }

  static ThemeData darkTheme({String languageCode = 'en'}) {
    final textTheme = GrsTypography.textTheme(
      languageCode: languageCode,
      isDark: true,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: const ColorScheme(
        brightness: Brightness.dark,
        primary: GrsColors.primaryDark,
        onPrimary: GrsColors.onPrimaryDark,
        primaryContainer: GrsColors.primaryContainerDark,
        onPrimaryContainer: GrsColors.onPrimaryContainerDark,
        secondary: GrsColors.secondaryDark,
        onSecondary: GrsColors.onSecondaryDark,
        surface: GrsColors.surfaceDark,
        onSurface: GrsColors.textPrimaryDark,
        surfaceContainerHighest: GrsColors.surfaceVariantDark,
        outline: GrsColors.outlineDark,
        error: GrsColors.syncRejected,
        onError: Colors.white,
      ),
      scaffoldBackgroundColor: GrsColors.backgroundDark,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.surfaceDark,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: GrsColors.textPrimaryDark,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: GrsColors.surfaceDark,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: GrsColors.outlineDark, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          backgroundColor: GrsColors.primaryDark,
          foregroundColor: GrsColors.onPrimaryDark,
          elevation: 0,
        ),
      ),
    );
  }
}
