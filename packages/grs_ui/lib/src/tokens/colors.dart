import 'package:flutter/material.dart';

/// Design tokens for GRS color system (Light & Dark) per docs/design/DESIGN.md.
abstract final class GrsColors {
  // Light Palette
  static const Color primaryLight = Color(0xFF004D40); // Deep Teal
  static const Color onPrimaryLight = Color(0xFFFFFFFF);
  static const Color primaryContainerLight = Color(0xFFE0F2F1);
  static const Color onPrimaryContainerLight = Color(0xFF00251A);

  static const Color secondaryLight = Color(0xFF283593); // Deep Indigo
  static const Color onSecondaryLight = Color(0xFFFFFFFF);

  static const Color backgroundLight = Color(0xFFF8F9FA);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceVariantLight = Color(0xFFECEFF1);
  static const Color outlineLight = Color(0xFFCFD8DC);

  static const Color textPrimaryLight = Color(0xFF1C1B1F);
  static const Color textSecondaryLight = Color(0xFF49454F);

  // Dark Palette
  static const Color primaryDark = Color(0xFF80CBC4); // Soft Mint Teal
  static const Color onPrimaryDark = Color(0xFF00332C);
  static const Color primaryContainerDark = Color(0xFF004D40);
  static const Color onPrimaryContainerDark = Color(0xFFE0F2F1);

  static const Color secondaryDark = Color(0xFF9FA8DA);
  static const Color onSecondaryDark = Color(0xFF1A237E);

  static const Color backgroundDark = Color(0xFF121212);
  static const Color surfaceDark = Color(0xFF1E1E1E);
  static const Color surfaceVariantDark = Color(0xFF2C2C2C);
  static const Color outlineDark = Color(0xFF424242);

  static const Color textPrimaryDark = Color(0xFFE6E1E5);
  static const Color textSecondaryDark = Color(0xFFCAC4D0);

  // Sync & Status Semantics
  static const Color syncDraft = Color(0xFF546E7A); // Slate
  static const Color syncDraftBg = Color(0xFFECEFF1);

  static const Color syncPending = Color(0xFFE65100); // Amber Orange
  static const Color syncPendingBg = Color(0xFFFFF3E0);

  static const Color syncSynced = Color(0xFF2E7D32); // Forest Green
  static const Color syncSyncedBg = Color(0xFFE8F5E9);

  static const Color syncRejected = Color(0xFFC62828); // Crimson
  static const Color syncRejectedBg = Color(0xFFFFEBEE);

  static const Color duplicateAlert = Color(0xFFF57F17); // Gold Ochre
  static const Color duplicateAlertBg = Color(0xFFFFFDE7);
}
