import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../tokens/motions.dart';

// ────────────────────────────────────────────────────────────────────────────
// GrsBounceTouch
// ────────────────────────────────────────────────────────────────────────────

/// Wraps a widget with a spring-scale press animation and haptic feedback.
///
/// On tap-down: scales down to [scaleFactor] with spring ease-in.
/// On tap-up / cancel: springs back to 1.0 and fires the callback.
///
/// Automatically no-ops when the system has reduced-motion enabled.
class GrsBounceTouch extends StatefulWidget {
  const GrsBounceTouch({
    super.key,
    required this.child,
    required this.onTap,
    this.scaleFactor = 0.97,
    this.haptic = true,
  });

  final Widget child;
  final VoidCallback? onTap;

  /// Scale target on press. Smaller = more pronounced press. Default 0.97.
  final double scaleFactor;

  /// Whether to fire a light haptic on press-down. Default true.
  final bool haptic;

  @override
  State<GrsBounceTouch> createState() => _GrsBounceTouchState();
}

class _GrsBounceTouchState extends State<GrsBounceTouch>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: GrsMotion.durationFast,
      reverseDuration: const Duration(milliseconds: 200),
    );
    _scale = Tween<double>(
      begin: 1.0,
      end: widget.scaleFactor,
    ).animate(CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveSpring));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _down(TapDownDetails _) {
    if (widget.onTap == null) return;
    if (widget.haptic) HapticFeedback.lightImpact();
    _ctrl.forward();
  }

  void _up(TapUpDetails _) {
    _ctrl.reverse();
    widget.onTap?.call();
  }

  void _cancel() => _ctrl.reverse();

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;

    final reducedMotion = MediaQuery.of(context).disableAnimations;
    if (reducedMotion) {
      return GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: widget.child,
      );
    }

    return GestureDetector(
      onTapDown: _down,
      onTapUp: _up,
      onTapCancel: _cancel,
      behavior: HitTestBehavior.opaque,
      child: ScaleTransition(scale: _scale, child: widget.child),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GrsFadeSlideItem
// ────────────────────────────────────────────────────────────────────────────

/// Staggered fade-and-rise entrance for list / grid items.
///
/// Each item rises [offsetY] logical pixels and fades from 0 → 1.
/// Delay = [index] × [GrsMotion.durationStagger] + [GrsMotion.durationInitialDelay].
///
/// No-ops (instant show) when the system has reduced-motion enabled.
class GrsFadeSlideItem extends StatefulWidget {
  const GrsFadeSlideItem({
    super.key,
    required this.child,
    required this.index,
    this.offsetY = 20.0,
  });

  final Widget child;
  final int index;

  /// Rise distance in logical pixels. Default 20 (matches [GrsMotion.entranceRise]).
  final double offsetY;

  @override
  State<GrsFadeSlideItem> createState() => _GrsFadeSlideItemState();
}

class _GrsFadeSlideItemState extends State<GrsFadeSlideItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _opacity;
  late final Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: GrsMotion.durationMedium,
    );

    _opacity = CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveEnter);

    _offset = Tween<Offset>(
      begin: Offset(0, widget.offsetY / 300),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveEnter));

    final inTest = const bool.fromEnvironment('flutter.test');
    if (inTest) {
      _ctrl.value = 1.0;
    } else {
      final delay =
          GrsMotion.durationInitialDelay +
          GrsMotion.durationStagger * widget.index;

      Future.delayed(delay, () {
        if (mounted) _ctrl.forward();
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations ||
        const bool.fromEnvironment('flutter.test')) {
      return widget.child;
    }

    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _offset, child: widget.child),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GrsFadeIn
// ────────────────────────────────────────────────────────────────────────────

/// Simple fade-in wrapper — used for full pages and dialog content.
class GrsFadeIn extends StatefulWidget {
  const GrsFadeIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration,
  });

  final Widget child;
  final Duration delay;
  final Duration? duration;

  @override
  State<GrsFadeIn> createState() => _GrsFadeInState();
}

class _GrsFadeInState extends State<GrsFadeIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: widget.duration ?? GrsMotion.durationMedium,
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveEnter);

    final inTest = const bool.fromEnvironment('flutter.test');
    if (inTest || widget.delay == Duration.zero) {
      _ctrl.value = 1.0;
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _ctrl.forward();
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations ||
        const bool.fromEnvironment('flutter.test')) {
      return widget.child;
    }
    return FadeTransition(opacity: _opacity, child: widget.child);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GrsRiseIn
// ────────────────────────────────────────────────────────────────────────────

/// Fade + rise entrance for a single element (section heading, banner, FAB).
class GrsRiseIn extends StatefulWidget {
  const GrsRiseIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.riseY = 20.0,
    this.duration,
  });

  final Widget child;
  final Duration delay;
  final double riseY;
  final Duration? duration;

  @override
  State<GrsRiseIn> createState() => _GrsRiseInState();
}

class _GrsRiseInState extends State<GrsRiseIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _opacity;
  late final Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: widget.duration ?? GrsMotion.durationMedium,
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveEnter);
    _offset = Tween<Offset>(
      begin: Offset(0, widget.riseY / 300),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: GrsMotion.curveEnter));

    final inTest = const bool.fromEnvironment('flutter.test');
    if (inTest || widget.delay == Duration.zero) {
      _ctrl.value = 1.0;
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _ctrl.forward();
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations ||
        const bool.fromEnvironment('flutter.test')) {
      return widget.child;
    }
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _offset, child: widget.child),
    );
  }
}
