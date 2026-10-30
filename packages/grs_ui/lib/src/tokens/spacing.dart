import 'package:flutter/material.dart';

/// GRS spacing tokens — v2.
///
/// One grid, one pair of tight margins (16 dp), used everywhere.
/// Large things run to the edges.
abstract final class GrsSpacing {
  static const double xxs = 4.0;
  static const double xs = 8.0;
  static const double sm = 12.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;

  /// Minimum interactive touch target (48 × 48 dp) per WCAG 2.5.5.
  static const double minTouchTarget = 48.0;

  /// Standard horizontal page margin.
  static const double pagePad = 16.0;

  /// Vertical gap between major sections on a screen (desktop analogue ≈ 120–240 px).
  static const double sectionGap = 24.0;

  /// Gap between items within a section (card list spacing).
  static const double itemGap = 8.0;
}

/// Border radius tokens for GRS components — v2.
///
/// All interactive surfaces use 12 px (modern, not overly pill-like).
/// Cards use 16 px for visual hierarchy separation.
abstract final class GrsRadii {
  /// Buttons and primary interactive controls.
  static const BorderRadius button = BorderRadius.all(Radius.circular(12.0));

  /// Filter chips and small tags.
  static const BorderRadius chip = BorderRadius.all(Radius.circular(8.0));

  /// Text input fields and dropdowns.
  static const BorderRadius input = BorderRadius.all(Radius.circular(12.0));

  /// Cards and panels.
  static const BorderRadius card = BorderRadius.all(Radius.circular(16.0));

  /// Dialogs and bottom sheets.
  static const BorderRadius dialog = BorderRadius.all(Radius.circular(20.0));

  /// Small tag/badge pills.
  static const BorderRadius tag = BorderRadius.all(Radius.circular(6.0));
}
