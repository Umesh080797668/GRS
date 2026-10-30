import 'package:flutter/material.dart';
import 'colors.dart';

/// Design tokens for GRS trilingual typography — v2.
///
/// Type scale:
///   display  → 32 px, weight 700   (hero numbers, large titles)
///   headline → 22–24 px, weight 700 (section headings)
///   title    → 17–18 px, weight 600 (card headings, sub-headings)
///   body     → 15–16 px, weight 400 (running text)
///   label    → 12–13 px, weight 500 (metadata, captions)
///
/// Tracking:
///   Headings: -0.3 to -0.5 (tight, modern)
///   Body: 0 (normal)
///   Labels: +0.2 (slightly loose for readability at small size)
///
/// Two font families only: Inter (latin) and Noto regional variants.
abstract final class GrsTypography {
  static const String fontLatin = 'Inter';
  static const String fontSinhala = 'NotoSansSinhala';
  static const String fontTamil = 'NotoSansTamil';

  /// Generates a trilingual TextStyle with appropriate line-height.
  static TextStyle style({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
    String? languageCode,
    double? customHeight,
    double letterSpacing = 0.0,
  }) {
    // Sinhala and Tamil require taller line-height multipliers (1.50–1.62)
    final isIndic = languageCode == 'si' || languageCode == 'ta';
    final height = customHeight ?? (isIndic ? 1.56 : 1.35);

    final String fontFamily = switch (languageCode) {
      'si' => fontSinhala,
      'ta' => fontTamil,
      _ => fontLatin,
    };

    return TextStyle(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      fontFamily: fontFamily,
      letterSpacing: letterSpacing,
    );
  }

  // ─── Named scale ──────────────────────────────────────────────────────────

  static TextStyle displayLarge({required Color color, String? languageCode}) =>
      style(
        fontSize: 32,
        fontWeight: FontWeight.w700,
        color: color,
        languageCode: languageCode,
        letterSpacing: -0.5,
        customHeight: 1.2,
      );

  static TextStyle headlineLarge({
    required Color color,
    String? languageCode,
  }) => style(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    color: color,
    languageCode: languageCode,
    letterSpacing: -0.4,
    customHeight: 1.25,
  );

  static TextStyle headlineMedium({
    required Color color,
    String? languageCode,
  }) => style(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    color: color,
    languageCode: languageCode,
    letterSpacing: -0.3,
    customHeight: 1.3,
  );

  static TextStyle titleLarge({required Color color, String? languageCode}) =>
      style(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: color,
        languageCode: languageCode,
        letterSpacing: -0.2,
      );

  static TextStyle titleMedium({required Color color, String? languageCode}) =>
      style(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: color,
        languageCode: languageCode,
        letterSpacing: -0.1,
      );

  static TextStyle bodyLarge({required Color color, String? languageCode}) =>
      style(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        color: color,
        languageCode: languageCode,
        customHeight: 1.55,
      );

  static TextStyle bodyMedium({required Color color, String? languageCode}) =>
      style(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: color,
        languageCode: languageCode,
        customHeight: 1.5,
      );

  static TextStyle labelMedium({required Color color, String? languageCode}) =>
      style(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: color,
        languageCode: languageCode,
        letterSpacing: 0.1,
      );

  static TextStyle labelSmall({required Color color, String? languageCode}) =>
      style(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: color,
        languageCode: languageCode,
        letterSpacing: 0.2,
      );

  static TextTheme textTheme({
    String languageCode = 'en',
    bool isDark = false,
  }) {
    final ink = isDark ? GrsColors.textPrimaryDark : GrsColors.textPrimaryLight;
    final secondary = isDark
        ? GrsColors.textSecondaryDark
        : GrsColors.textSecondaryLight;

    return TextTheme(
      displayLarge: displayLarge(color: ink, languageCode: languageCode),
      headlineLarge: headlineLarge(color: ink, languageCode: languageCode),
      headlineMedium: headlineMedium(color: ink, languageCode: languageCode),
      titleLarge: style(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: ink,
        languageCode: languageCode,
        letterSpacing: -0.4,
      ),
      titleMedium: titleMedium(color: ink, languageCode: languageCode),
      titleSmall: style(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: ink,
        languageCode: languageCode,
      ),
      bodyLarge: bodyLarge(color: ink, languageCode: languageCode),
      bodyMedium: bodyMedium(color: ink, languageCode: languageCode),
      bodySmall: style(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: secondary,
        languageCode: languageCode,
      ),
      labelLarge: style(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: ink,
        languageCode: languageCode,
      ),
      labelMedium: labelMedium(color: secondary, languageCode: languageCode),
      labelSmall: labelSmall(color: secondary, languageCode: languageCode),
    );
  }
}
