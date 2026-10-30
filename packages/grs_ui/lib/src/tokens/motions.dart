import 'package:flutter/animation.dart';

/// GRS motion design tokens — v2.
///
/// Rules:
/// - Transform and opacity only; every move has a prefers-reduced-motion path
///   (handled in widgets using MediaQuery.disableAnimations).
/// - The signature app move is the spring-enter: content rises 20 px with
///   opacity from 0 to 1, triggered once as each section enters the viewport.
/// - Stagger between list items: 55 ms.
abstract final class GrsMotion {
  // ─── Durations ────────────────────────────────────────────────────────────
  /// Micro interactions: press, hover, toggle. 120 ms.
  static const Duration durationFast = Duration(milliseconds: 120);

  /// Section and element entrances. 300 ms.
  static const Duration durationMedium = Duration(milliseconds: 300);

  /// Page-level transitions and large reveals. 480 ms.
  static const Duration durationSlow = Duration(milliseconds: 480);

  /// Stagger delay between consecutive list items. 55 ms.
  static const Duration durationStagger = Duration(milliseconds: 55);

  /// Delay before the first animated element begins (cold-start settle). 80 ms.
  static const Duration durationInitialDelay = Duration(milliseconds: 80);

  // ─── Curves ───────────────────────────────────────────────────────────────
  /// Elements entering the screen — decelerate into position.
  static const Curve curveEnter = Curves.easeOutCubic;

  /// Elements leaving the screen — accelerate out.
  static const Curve curveExit = Curves.easeInCubic;

  /// Spring-feel for interactive responses (button press, chip select).
  static const Curve curveSpring = Curves.easeOutBack;

  /// Linear for progress indicators and loaders.
  static const Curve curveLinear = Curves.linear;

  /// Smooth deceleration for value changes (counter, badge update).
  static const Curve curveSmoothStep = Curves.fastLinearToSlowEaseIn;

  // ─── Rise amounts ─────────────────────────────────────────────────────────
  /// Standard entrance rise — 20 logical pixels.
  static const double entranceRise = 20.0;

  /// List item entrance rise — 16 logical pixels (subtler for dense lists).
  static const double listRise = 16.0;

  /// Hero panel rise — 28 logical pixels (prominent reveal).
  static const double heroRise = 28.0;
}
