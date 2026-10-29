import 'package:flutter/material.dart';

abstract final class GrsColors {
  // Light Palette - Contemporary Jewel Teal & Vibrant Accents
  static const Color primaryLight = Color(0xFF00796B); // Luminous Deep Teal
  static const Color primaryVariantLight = Color(0xFF004D40);
  static const Color onPrimaryLight = Color(0xFFFFFFFF);
  static const Color primaryContainerLight = Color(0xFFE0F2F1);
  static const Color onPrimaryContainerLight = Color(0xFF00382E);

  static const Color secondaryLight = Color(0xFF3949AB); // Crisp Indigo
  static const Color onSecondaryLight = Color(0xFFFFFFFF);
  static const Color secondaryContainerLight = Color(0xFFE8EAF6);
  static const Color onSecondaryContainerLight = Color(0xFF1A237E);

  // Surfaces & Backgrounds (Modern warm-slate tints)
  static const Color backgroundLight = Color(0xFFF7F9FC);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceVariantLight = Color(0xFFF0F4F8);
  static const Color outlineLight = Color(0xFFE2E8F0);
  static const Color outlineFocusedLight = Color(0xFF00897B);

  static const Color textPrimaryLight = Color(0xFF0F172A); // Slate 900
  static const Color textSecondaryLight = Color(0xFF64748B); // Slate 500
  static const Color textTertiaryLight = Color(0xFF94A3B8); // Slate 400

  // Dark Palette - Deep Slate Oled-friendly
  static const Color primaryDark = Color(0xFF26A69A); // Vibrant Mint
  static const Color primaryVariantDark = Color(0xFF80CBC4);
  static const Color onPrimaryDark = Color(0xFF00251F);
  static const Color primaryContainerDark = Color(0xFF004D40);
  static const Color onPrimaryContainerDark = Color(0xFFB2DFDB);

  static const Color secondaryDark = Color(0xFF7986CB);
  static const Color onSecondaryDark = Color(0xFF0F1538);

  static const Color backgroundDark = Color(0xFF0A0F1D); // Deep Navy Black
  static const Color surfaceDark = Color(0xFF131B2E);
  static const Color surfaceVariantDark = Color(0xFF1E293B);
  static const Color outlineDark = Color(0xFF334155);
  static const Color outlineFocusedDark = Color(0xFF26A69A);

  static const Color textPrimaryDark = Color(0xFFF8FAFC);
  static const Color textSecondaryDark = Color(0xFF94A3B8);
  static const Color textTertiaryDark = Color(0xFF64748B);

  // Status & Sync Semantics (Soft background with crisp foreground)
  static const Color syncDraft = Color(0xFF64748B);
  static const Color syncDraftBg = Color(0xFFF1F5F9);

  static const Color syncPending = Color(0xFFF59E0B); // Amber
  static const Color syncPendingBg = Color(0xFFFEF3C7);

  static const Color syncSynced = Color(0xFF10B981); // Emerald
  static const Color syncSyncedBg = Color(0xFFD1FAE5);

  static const Color syncRejected = Color(0xFFEF4444); // Rose
  static const Color syncRejectedBg = Color(0xFFFEE2E2);

  static const Color duplicateAlert = Color(0xFFEAB308);
  static const Color duplicateAlertBg = Color(0xFFFEF9C3);

  // Modern Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF00897B), Color(0xFF004D40)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient heroGradient = LinearGradient(
    colors: [Color(0xFF005B52), Color(0xFF00382E)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient cardGlowGradient = LinearGradient(
    colors: [Color(0x0F00796B), Color(0x0000796B)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
}
