import 'package:flutter/material.dart';
import 'colors.dart';
import 'typography.dart';

/// Predefined ThemeData per docs/design/DESIGN.md.
class GrsTheme {
  static ThemeData lightTheme({String languageCode = 'en'}) {
    final textTheme = _buildTextTheme(
      textColor: GrsColors.textPrimaryLight,
      languageCode: languageCode,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: GrsColors.primaryLight,
      scaffoldBackgroundColor: GrsColors.backgroundLight,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: GrsColors.primaryLight,
        onPrimary: GrsColors.onPrimaryLight,
        primaryContainer: GrsColors.primaryContainerLight,
        onPrimaryContainer: GrsColors.onPrimaryContainerLight,
        secondary: GrsColors.secondaryLight,
        onSecondary: GrsColors.onSecondaryLight,
        error: GrsColors.syncRejected,
        onError: Colors.white,
        surface: GrsColors.surfaceLight,
        onSurface: GrsColors.textPrimaryLight,
        outline: GrsColors.outlineLight,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.primaryLight,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GrsTypography.titleMedium(
          color: Colors.white,
          languageCode: languageCode,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 48), // 48dp floor
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          backgroundColor: GrsColors.primaryLight,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(88, 48), // 48dp floor
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          side: const BorderSide(color: GrsColors.outlineLight, width: 1.5),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GrsColors.surfaceLight,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.outlineLight),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.outlineLight),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.primaryLight, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(
            color: GrsColors.syncRejected,
            width: 1.5,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.syncRejected, width: 2),
        ),
      ),
    );
  }

  static ThemeData darkTheme({String languageCode = 'en'}) {
    final textTheme = _buildTextTheme(
      textColor: GrsColors.textPrimaryDark,
      languageCode: languageCode,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: GrsColors.primaryDark,
      scaffoldBackgroundColor: GrsColors.backgroundDark,
      colorScheme: const ColorScheme(
        brightness: Brightness.dark,
        primary: GrsColors.primaryDark,
        onPrimary: GrsColors.onPrimaryDark,
        primaryContainer: GrsColors.primaryContainerDark,
        onPrimaryContainer: GrsColors.onPrimaryContainerDark,
        secondary: GrsColors.secondaryDark,
        onSecondary: GrsColors.onSecondaryDark,
        error: GrsColors.syncRejected,
        onError: Colors.black,
        surface: GrsColors.surfaceDark,
        onSurface: GrsColors.textPrimaryDark,
        outline: GrsColors.outlineDark,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.surfaceDark,
        foregroundColor: GrsColors.textPrimaryDark,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GrsTypography.titleMedium(
          color: GrsColors.textPrimaryDark,
          languageCode: languageCode,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 48), // 48dp floor
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          backgroundColor: GrsColors.primaryDark,
          foregroundColor: GrsColors.onPrimaryDark,
          elevation: 0,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GrsColors.surfaceVariantDark,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.outlineDark),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.outlineDark),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: GrsColors.primaryDark, width: 2),
        ),
      ),
    );
  }

  static TextTheme _buildTextTheme({
    required Color textColor,
    required String languageCode,
  }) {
    return TextTheme(
      displayLarge: GrsTypography.displayLarge(
        color: textColor,
        languageCode: languageCode,
      ),
      headlineMedium: GrsTypography.headlineMedium(
        color: textColor,
        languageCode: languageCode,
      ),
      titleMedium: GrsTypography.titleMedium(
        color: textColor,
        languageCode: languageCode,
      ),
      bodyLarge: GrsTypography.bodyLarge(
        color: textColor,
        languageCode: languageCode,
      ),
      bodyMedium: GrsTypography.bodyMedium(
        color: textColor,
        languageCode: languageCode,
      ),
      labelSmall: GrsTypography.labelSmall(
        color: textColor,
        languageCode: languageCode,
      ),
    );
  }
}
