import 'package:flutter/material.dart';

/// GRS design-system color tokens — v3.
///
/// Palette direction: Cobalt-blue primary × warm stone ground.
/// Light is the primary mode; dark mirrors it with oled-friendly deep navy.
///
/// Rules enforced:
/// - No decorative gradients as backgrounds.
/// - One ground, one ink, one accent.
/// - Surfaces separated by a small tone step, never by a line or shadow at rest.
abstract final class GrsColors {
  // ─── Primary — Cobalt Blue ─────────────────────────────────────────────────
  static const Color primaryLight = Color(0xFF1E3A8A); // Cobalt 800 (primary)
  static const Color primaryMid = Color(0xFF2563EB); // Cobalt 600
  static const Color primaryAccent = Color(0xFF3B82F6); // Cobalt 500 (accent)
  static const Color primaryVariantLight = Color(0xFF1E3A8A);
  static const Color onPrimaryLight = Color(0xFFFFFFFF);
  static const Color primaryContainerLight = Color(0xFFDBEAFE); // Cobalt 100
  static const Color onPrimaryContainerLight = Color(0xFF1E3A8A);

  // ─── Secondary — Slate ────────────────────────────────────────────────────
  static const Color secondaryLight = Color(0xFF475569); // Slate 600
  static const Color onSecondaryLight = Color(0xFFFFFFFF);
  static const Color secondaryContainerLight = Color(0xFFF1F5F9);
  static const Color onSecondaryContainerLight = Color(0xFF0F172A);

  // ─── Light Surfaces (warm stone) ─────────────────────────────────────────
  static const Color backgroundLight = Color(0xFFF8FAFC); // Slate 50
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceVariantLight = Color(0xFFF1F5F9); // Slate 100
  static const Color outlineLight = Color(0xFFE2E8F0); // Slate 200
  static const Color outlineFocusedLight = Color(0xFF2563EB);

  static const Color textPrimaryLight = Color(0xFF0F172A); // Slate 900
  static const Color textSecondaryLight = Color(0xFF475569); // Slate 600
  static const Color textTertiaryLight = Color(0xFF94A3B8); // Slate 400

  // ─── Dark Surfaces (oled-friendly deep navy) ──────────────────────────────
  static const Color primaryDark = Color(
    0xFF60A5FA,
  ); // Cobalt 400 — vivid on dark
  static const Color primaryVariantDark = Color(0xFF93C5FD);
  static const Color onPrimaryDark = Color(0xFF0F172A);
  static const Color primaryContainerDark = Color(0xFF1E3A8A);
  static const Color onPrimaryContainerDark = Color(0xFFBFDBFE);

  static const Color secondaryDark = Color(0xFF93C5FD);
  static const Color onSecondaryDark = Color(0xFF0F172A);

  static const Color backgroundDark = Color(0xFF060E1E);
  static const Color surfaceDark = Color(0xFF0D1625);
  static const Color surfaceVariantDark = Color(0xFF162033);
  static const Color outlineDark = Color(0xFF1E3A5F);
  static const Color outlineFocusedDark = Color(0xFF60A5FA);

  static const Color textPrimaryDark = Color(0xFFF0F6FF);
  static const Color textSecondaryDark = Color(0xFF94A3B8);
  static const Color textTertiaryDark = Color(0xFF475569);

  // ─── Semantic Status ──────────────────────────────────────────────────────
  static const Color syncDraft = Color(0xFF475569);
  static const Color syncDraftBg = Color(0xFFF1F5F9);

  static const Color syncPending = Color(0xFFB45309); // Amber 700
  static const Color syncPendingBg = Color(0xFFFEF3C7);

  static const Color syncSynced = Color(0xFF059669); // Emerald 600
  static const Color syncSyncedBg = Color(0xFFD1FAE5);

  static const Color syncRejected = Color(0xFFDC2626); // Red 600
  static const Color syncRejectedBg = Color(0xFFFEE2E2);

  static const Color duplicateAlert = Color(0xFFD97706);
  static const Color duplicateAlertBg = Color(0xFFFEF3C7);

  // ─── Semantic Status — Dark backgrounds ──────────────────────────────────
  static const Color syncDraftBgDark = Color(0xFF1E293B);
  static const Color syncPendingBgDark = Color(0xFF292109);
  static const Color syncSyncedBgDark = Color(0xFF064E3B);
  static const Color syncRejectedBgDark = Color(0xFF450A0A);

  // ─── Utility ─────────────────────────────────────────────────────────────
  /// Photo scrim — the one linear gradient exception (used only as a scrim
  /// under text laid over a photograph).
  static const LinearGradient photoScrim = LinearGradient(
    colors: [Color(0xCC0F172A), Color(0x000F172A)],
    begin: Alignment.bottomCenter,
    end: Alignment.topCenter,
  );

  /// Hero banner flat color — solid cobalt, used as the status banner panel
  /// in the HomeScreen.  Not a decorative gradient.
  static const Color heroBannerBg = Color(0xFF1E3A8A);
  static const Color heroBannerBgDark = Color(0xFF162033);

  // Kept for backward compat — resolves to flat solid only.
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF1E3A8A), Color(0xFF1E3A8A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient heroGradient = LinearGradient(
    colors: [Color(0xFF1E3A8A), Color(0xFF1E3A8A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient cardGlowGradient = LinearGradient(
    colors: [Color(0x002563EB), Color(0x002563EB)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
}
