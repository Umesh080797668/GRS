import 'package:flutter/animation.dart';

abstract final class GrsMotion {
  // Durations
  static const Duration durationFast = Duration(milliseconds: 150);
  static const Duration durationMedium = Duration(milliseconds: 300);
  static const Duration durationSlow = Duration(milliseconds: 500);
  static const Duration durationStagger = Duration(milliseconds: 60);

  // Curves
  static const Curve curveEnter = Curves.easeOutCubic;
  static const Curve curveExit = Curves.easeInCubic;
  static const Curve curveSpring = Curves.easeOutBack;
  static const Curve curveLinear = Curves.linear;
}
