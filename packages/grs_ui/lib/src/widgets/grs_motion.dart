import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../tokens/motions.dart';

/// Wraps widgets with subtle scaling and tactile haptic feedback on touch.
class GrsBounceTouch extends StatefulWidget {
  const GrsBounceTouch({
    super.key,
    required this.child,
    required this.onTap,
    this.scaleFactor = 0.97,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double scaleFactor;

  @override
  State<GrsBounceTouch> createState() => _GrsBounceTouchState();
}

class _GrsBounceTouchState extends State<GrsBounceTouch>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: GrsMotion.durationFast,
    );
    _scaleAnimation = Tween<double>(
      begin: 1.0,
      end: widget.scaleFactor,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) {
    if (widget.onTap == null) return;
    HapticFeedback.lightImpact();
    _controller.forward();
  }

  void _onTapUp(TapUpDetails _) {
    if (widget.onTap == null) return;
    _controller.reverse();
    widget.onTap!();
  }

  void _onTapCancel() {
    _controller.reverse();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;

    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      behavior: HitTestBehavior.opaque,
      child: ScaleTransition(scale: _scaleAnimation, child: widget.child),
    );
  }
}

/// Staggered fade and slide entrance for list items.
class GrsFadeSlideItem extends StatefulWidget {
  const GrsFadeSlideItem({
    super.key,
    required this.child,
    required this.index,
    this.offsetY = 24.0,
  });

  final Widget child;
  final int index;
  final double offsetY;

  @override
  State<GrsFadeSlideItem> createState() => _GrsFadeSlideItemState();
}

class _GrsFadeSlideItemState extends State<GrsFadeSlideItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;
  late final Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: GrsMotion.durationMedium,
    );

    _opacity = CurvedAnimation(
      parent: _controller,
      curve: GrsMotion.curveEnter,
    );

    _offset =
        Tween<Offset>(
          begin: Offset(0, widget.offsetY / 100),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(parent: _controller, curve: GrsMotion.curveEnter),
        );

    Future.delayed(GrsMotion.durationStagger * widget.index, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _offset, child: widget.child),
    );
  }
}
