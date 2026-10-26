import 'package:flutter/material.dart';

/// Design tokens for GRS spacing and geometry per docs/design/DESIGN.md.
abstract final class GrsSpacing {
  static const double xxs = 4.0;
  static const double xs = 8.0;
  static const double sm = 12.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;

  /// Invariant: minimum interactive touch target dimension (48x48 dp)
  static const double minTouchTarget = 48.0;
}

/// Border radius tokens for GRS components.
abstract final class GrsRadii {
  static const BorderRadius button = BorderRadius.all(Radius.circular(8.0));
  static const BorderRadius chip = BorderRadius.all(Radius.circular(8.0));
  static const BorderRadius input = BorderRadius.all(Radius.circular(6.0));
  static const BorderRadius card = BorderRadius.all(Radius.circular(8.0));
  static const BorderRadius dialog = BorderRadius.all(Radius.circular(12.0));
}
