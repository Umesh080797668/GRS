import 'package:flutter/material.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF001915),
      body: Stack(
        children: [
          // Background ambient gradient
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF002922), // Midnight teal top
                    Color(0xFF001915), // Deep jewel teal middle
                    Color(0xFF070B12), // OLED slate bottom
                  ],
                  stops: [0.0, 0.45, 1.0],
                ),
              ),
            ),
          ),

          // Subtle ambient glow orbs in the background
          Positioned(
            top: -60,
            right: -60,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF00897B).withValues(alpha: 0.15),
                    const Color(0xFF00897B).withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 120,
            left: -80,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF26A69A).withValues(alpha: 0.10),
                    const Color(0xFF26A69A).withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),

          // Central content & footer
          SafeArea(
            child: Column(
              children: [
                const Spacer(flex: 3),

                // Frosted glass emblem card with glow
                Container(
                  width: 104,
                  height: 104,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(26),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        const Color(0xFF004D40).withValues(alpha: 0.70),
                        const Color(0xFF00241E).withValues(alpha: 0.90),
                      ],
                    ),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.15),
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF00897B).withValues(alpha: 0.35),
                        blurRadius: 36,
                        spreadRadius: 2,
                        offset: const Offset(0, 10),
                      ),
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.50),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.asset(
                      'assets/images/app_logo.png',
                      width: 76,
                      height: 76,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.shield_outlined,
                        size: 56,
                        color: Color(0xFF80CBC4),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 28),

                // Official platform pill badge
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF004D40).withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: const Color(0xFF00897B).withValues(alpha: 0.50),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFF10B981),
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0xFF10B981),
                              blurRadius: 4,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'NATIONAL FIELD ENUMERATION',
                        style: TextStyle(
                          color: Color(0xFF80CBC4),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),

                // Main Title
                const Text(
                  'Global Research & Survey',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFF8FAFC),
                    letterSpacing: -0.4,
                  ),
                ),

                const SizedBox(height: 6),

                // Subtitle
                const Text(
                  'Door-to-Door Census & Field Operations',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF94A3B8),
                    letterSpacing: 0.1,
                  ),
                ),

                const SizedBox(height: 36),

                // Sleek Indeterminate Progress Indicator
                SizedBox(
                  width: 140,
                  height: 3,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      backgroundColor: Colors.white.withValues(alpha: 0.08),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xFF26A69A),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Status text
                const Text(
                  'Securing local workspace...',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    letterSpacing: 0.3,
                  ),
                ),

                const Spacer(flex: 4),

                // Footer with security badge
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 13,
                      color: Color(0xFF64748B),
                    ),
                    SizedBox(width: 6),
                    Text(
                      '256-Bit Offline Encrypted • Air-Gapped Ready',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 4),

                const Text(
                  'Department of Census & Household Statistics',
                  style: TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 10,
                    letterSpacing: 0.3,
                  ),
                ),

                const SizedBox(height: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
