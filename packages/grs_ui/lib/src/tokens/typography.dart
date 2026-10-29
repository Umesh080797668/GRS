import 'package:flutter/material.dart';
import 'colors.dart';

/// Design tokens for GRS trilingual typography per docs/design/DESIGN.md.
abstract final class GrsTypography {
  static const String fontLatin = 'Inter';
  static const String fontSinhala = 'NotoSansSinhala';
  static const String fontTamil = 'NotoSansTamil';

  /// Generates a trilingual TextStyle with adjusted line-height to prevent clipping.
  static TextStyle style({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
    String? languageCode,
    double? customHeight,
  }) {
    // Sinhala and Tamil require taller line-height multipliers (1.50-1.62)
    final isIndic = languageCode == 'si' || languageCode == 'ta';
    final height = customHeight ?? (isIndic ? 1.56 : 1.35);

    String? fontFamily;
    if (languageCode == 'si') {
      fontFamily = fontSinhala;
    } else if (languageCode == 'ta') {
      fontFamily = fontTamil;
    } else {
      fontFamily = fontLatin;
    }

    return TextStyle(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      fontFamily: fontFamily,
    );
  }

  static TextStyle displayLarge({required Color color, String? languageCode}) =>
      style(
        fontSize: 32,
        fontWeight: FontWeight.w700,
        color: color,
        languageCode: languageCode,
      );

  static TextStyle headlineMedium({
    required Color color,
    String? languageCode,
  }) => style(
    fontSize: 24,
    fontWeight: FontWeight.w600,
    color: color,
    languageCode: languageCode,
  );

  static TextStyle titleMedium({required Color color, String? languageCode}) =>
      style(
        fontSize: 18,
        fontWeight: FontWeight.w500,
        color: color,
        languageCode: languageCode,
      );

  static TextStyle bodyLarge({required Color color, String? languageCode}) =>
      style(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        color: color,
        languageCode: languageCode,
      );

  static TextStyle bodyMedium({required Color color, String? languageCode}) =>
      style(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: color,
        languageCode: languageCode,
      );

  static TextStyle labelSmall({required Color color, String? languageCode}) =>
      style(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: color,
        languageCode: languageCode,
      );

  static TextTheme textTheme({
    String languageCode = 'en',
    bool isDark = false,
  }) {
    final color = isDark
        ? GrsColors.textPrimaryDark
        : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;
    return TextTheme(
      displayLarge: displayLarge(color: color, languageCode: languageCode),
      headlineMedium: headlineMedium(color: color, languageCode: languageCode),
      titleLarge: style(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: color,
        languageCode: languageCode,
      ),
      titleMedium: titleMedium(color: color, languageCode: languageCode),
      bodyLarge: bodyLarge(color: color, languageCode: languageCode),
      bodyMedium: bodyMedium(color: color, languageCode: languageCode),
      labelMedium: style(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: color,
        languageCode: languageCode,
      ),
      labelSmall: labelSmall(color: secondary, languageCode: languageCode),
    );
  }
}
