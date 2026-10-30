import 'package:flutter/material.dart';
import 'colors.dart';
import 'typography.dart';

/// GRS Material 3 theme — v3.
///
/// Light is the primary mode. The dark theme follows the same geometry with
/// the oled-friendly navy surface palette from GrsColors.
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
      fontFamily: GrsTypography.fontLatin,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: GrsColors.primaryLight,
        onPrimary: GrsColors.onPrimaryLight,
        primaryContainer: GrsColors.primaryContainerLight,
        onPrimaryContainer: GrsColors.onPrimaryContainerLight,
        secondary: GrsColors.secondaryLight,
        onSecondary: GrsColors.onSecondaryLight,
        secondaryContainer: GrsColors.secondaryContainerLight,
        onSecondaryContainer: GrsColors.onSecondaryContainerLight,
        surface: GrsColors.surfaceLight,
        onSurface: GrsColors.textPrimaryLight,
        surfaceContainerHighest: GrsColors.surfaceVariantLight,
        outline: GrsColors.outlineLight,
        outlineVariant: GrsColors.outlineLight,
        error: GrsColors.syncRejected,
        onError: Colors.white,
        tertiary: GrsColors.syncSynced,
        onTertiary: Colors.white,
      ),
      scaffoldBackgroundColor: GrsColors.backgroundLight,
      textTheme: textTheme,
      // ── AppBar ──────────────────────────────────────────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleSpacing: 20,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: GrsColors.textPrimaryLight,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          fontSize: 20,
        ),
        iconTheme: const IconThemeData(
          color: GrsColors.textPrimaryLight,
          size: 22,
        ),
      ),
      // ── Card ────────────────────────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: GrsColors.surfaceLight,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: GrsColors.outlineLight, width: 1),
        ),
      ),
      // ── Input ───────────────────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GrsColors.surfaceVariantLight,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GrsColors.outlineLight, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: GrsColors.primaryLight,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GrsColors.syncRejected, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: GrsColors.syncRejected,
            width: 1.5,
          ),
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textTertiaryLight,
        ),
        labelStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryLight,
        ),
        floatingLabelStyle: textTheme.labelMedium?.copyWith(
          color: GrsColors.primaryLight,
        ),
      ),
      // ── Chip ────────────────────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide.none,
        ),
        side: BorderSide.none,
        selectedColor: GrsColors.primaryContainerLight,
        backgroundColor: GrsColors.surfaceVariantLight,
        checkmarkColor: GrsColors.primaryLight,
        labelStyle: textTheme.labelMedium?.copyWith(
          color: GrsColors.textPrimaryLight,
          fontWeight: FontWeight.w600,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      // ── Elevated Button ─────────────────────────────────────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          backgroundColor: GrsColors.primaryLight,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: textTheme.labelLarge,
        ),
      ),
      // ── Outlined Button ─────────────────────────────────────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(88, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: const BorderSide(color: GrsColors.outlineLight, width: 1.5),
          foregroundColor: GrsColors.primaryLight,
          textStyle: textTheme.labelLarge,
        ),
      ),
      // ── Text Button ─────────────────────────────────────────────────────────
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: GrsColors.primaryLight,
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
      ),
      // ── Bottom Sheet ────────────────────────────────────────────────────────
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: GrsColors.surfaceLight,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        elevation: 0,
      ),
      // ── Dialog ──────────────────────────────────────────────────────────────
      dialogTheme: DialogThemeData(
        backgroundColor: GrsColors.surfaceLight,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        elevation: 4,
        shadowColor: const Color(0x1A0F172A),
        titleTextStyle: textTheme.headlineMedium?.copyWith(
          color: GrsColors.textPrimaryLight,
        ),
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryLight,
        ),
      ),
      // ── Snack Bar ───────────────────────────────────────────────────────────
      snackBarTheme: SnackBarThemeData(
        backgroundColor: GrsColors.textPrimaryLight,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        behavior: SnackBarBehavior.floating,
      ),
      // ── Divider ─────────────────────────────────────────────────────────────
      dividerTheme: const DividerThemeData(
        color: GrsColors.outlineLight,
        thickness: 1,
        space: 1,
      ),
      // ── List Tile ───────────────────────────────────────────────────────────
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: GrsColors.textPrimaryLight,
        ),
        subtitleTextStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryLight,
        ),
        iconColor: GrsColors.textSecondaryLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      // ── Segmented Button ────────────────────────────────────────────────────
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          backgroundColor: GrsColors.surfaceVariantLight,
          selectedBackgroundColor: GrsColors.primaryLight,
          foregroundColor: GrsColors.textSecondaryLight,
          selectedForegroundColor: Colors.white,
          side: const BorderSide(color: GrsColors.outlineLight, width: 1),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
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
      fontFamily: GrsTypography.fontLatin,
      colorScheme: const ColorScheme(
        brightness: Brightness.dark,
        primary: GrsColors.primaryDark,
        onPrimary: GrsColors.onPrimaryDark,
        primaryContainer: GrsColors.primaryContainerDark,
        onPrimaryContainer: GrsColors.onPrimaryContainerDark,
        secondary: GrsColors.secondaryDark,
        onSecondary: GrsColors.onSecondaryDark,
        secondaryContainer: GrsColors.surfaceVariantDark,
        onSecondaryContainer: GrsColors.textPrimaryDark,
        surface: GrsColors.surfaceDark,
        onSurface: GrsColors.textPrimaryDark,
        surfaceContainerHighest: GrsColors.surfaceVariantDark,
        outline: GrsColors.outlineDark,
        outlineVariant: GrsColors.outlineDark,
        error: GrsColors.syncRejected,
        onError: Colors.white,
        tertiary: GrsColors.syncSynced,
        onTertiary: Colors.white,
      ),
      scaffoldBackgroundColor: GrsColors.backgroundDark,
      textTheme: textTheme,
      // ── AppBar ──────────────────────────────────────────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: GrsColors.surfaceDark,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleSpacing: 20,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          color: GrsColors.textPrimaryDark,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          fontSize: 20,
        ),
        iconTheme: const IconThemeData(
          color: GrsColors.textPrimaryDark,
          size: 22,
        ),
      ),
      // ── Card ────────────────────────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: GrsColors.surfaceDark,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: GrsColors.outlineDark, width: 1),
        ),
      ),
      // ── Input ───────────────────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GrsColors.surfaceVariantDark,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GrsColors.outlineDark, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: GrsColors.primaryDark,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GrsColors.syncRejected, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: GrsColors.syncRejected,
            width: 1.5,
          ),
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textTertiaryDark,
        ),
        labelStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryDark,
        ),
        floatingLabelStyle: textTheme.labelMedium?.copyWith(
          color: GrsColors.primaryDark,
        ),
      ),
      // ── Chip ────────────────────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide.none,
        ),
        side: BorderSide.none,
        selectedColor: GrsColors.primaryContainerDark,
        backgroundColor: GrsColors.surfaceVariantDark,
        checkmarkColor: GrsColors.primaryDark,
        labelStyle: textTheme.labelMedium?.copyWith(
          color: GrsColors.textPrimaryDark,
          fontWeight: FontWeight.w600,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      // ── Elevated Button ─────────────────────────────────────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(88, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          backgroundColor: GrsColors.primaryDark,
          foregroundColor: GrsColors.onPrimaryDark,
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: textTheme.labelLarge,
        ),
      ),
      // ── Outlined Button ─────────────────────────────────────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(88, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: const BorderSide(color: GrsColors.outlineDark, width: 1.5),
          foregroundColor: GrsColors.primaryDark,
          textStyle: textTheme.labelLarge,
        ),
      ),
      // ── Text Button ─────────────────────────────────────────────────────────
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: GrsColors.primaryDark,
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
      ),
      // ── Bottom Sheet ────────────────────────────────────────────────────────
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: GrsColors.surfaceDark,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        elevation: 0,
      ),
      // ── Dialog ──────────────────────────────────────────────────────────────
      dialogTheme: DialogThemeData(
        backgroundColor: GrsColors.surfaceDark,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        elevation: 8,
        shadowColor: Colors.black54,
        titleTextStyle: textTheme.headlineMedium?.copyWith(
          color: GrsColors.textPrimaryDark,
        ),
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryDark,
        ),
      ),
      // ── Snack Bar ───────────────────────────────────────────────────────────
      snackBarTheme: SnackBarThemeData(
        backgroundColor: GrsColors.surfaceVariantDark,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textPrimaryDark,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        behavior: SnackBarBehavior.floating,
      ),
      // ── Divider ─────────────────────────────────────────────────────────────
      dividerTheme: const DividerThemeData(
        color: GrsColors.outlineDark,
        thickness: 1,
        space: 1,
      ),
      // ── List Tile ───────────────────────────────────────────────────────────
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: GrsColors.textPrimaryDark,
        ),
        subtitleTextStyle: textTheme.bodyMedium?.copyWith(
          color: GrsColors.textSecondaryDark,
        ),
        iconColor: GrsColors.textSecondaryDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      // ── Segmented Button ────────────────────────────────────────────────────
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          backgroundColor: GrsColors.surfaceVariantDark,
          selectedBackgroundColor: GrsColors.primaryDark,
          foregroundColor: GrsColors.textSecondaryDark,
          selectedForegroundColor: GrsColors.onPrimaryDark,
          side: const BorderSide(color: GrsColors.outlineDark, width: 1),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    );
  }
}
