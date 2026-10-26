# GRS (Global Research & Survey App) — Design System & UI/UX Specification

*Design Specification v1.0 · 26 October 2026*  
*Standard: `Leonxlnx/taste-skill` (anti-slop, intentional hierarchy) + `flutter/agent-plugins` (idiomatic Flutter) subordinate to Agent Build Plan v1.2 §4.2.*

---

## 1. Aesthetic Direction & Principles

1. **High Contrast, Zero Clutter ("Field First"):**
   - Survey enumerators operate under intense outdoor sunlight in rural/urban Sri Lanka. Low contrast or subtle grey-on-grey text is unusable in the field.
   - High visual contrast (WCAG AAA for text, AA for UI controls) is mandatory across all screens.
2. **Anti-Slop & Professional Authority:**
   - Avoid generic, bloated, toy-like "AI-generated" templates. No excessive rounded bubbly buttons, no floating animated blobs.
   - Clean, purposeful, civic-grade interface inspired by clean editorial and high-reliability data capture applications.
3. **Trilingual Typography Excellence:**
   - Equal visual gravity for Sinhala (සිංහල), Tamil (தமிழ்), and English.
   - Sinhala and Tamil have taller ascenders, complex descenders, and stacked conjuncts. Generous line-height multiplier (`1.45–1.60`) is enforced to prevent glyph clipping.
4. **Predictable Motion & Extreme Performance:**
   - Target devices include 2 GB–3 GB RAM Android 10+ devices.
   - Motion is **low** (150–250 ms transitions maximum, no continuous looping canvas shaders or heavy animations).
5. **Always-Obvious Offline & Sync Status:**
   - Every record and header clearly signals sync status: Draft, Pending, Synced, or Rejected. The user must never wonder whether their data is safely persisted.

---

## 2. Density & Variance Dials (§4.2)

| Platform | Variance | Motion | Density | Target User |
| --- | --- | --- | --- | --- |
| **Mobile App (Android)** | **Low** | **Low** (150–200 ms) | **Low to Medium** | Field agents (L4, L5) typing quickly outdoors; minimum touch target 48×48 dp. |
| **Web Dashboard** | **Low** | **Low** (100–180 ms) | **Medium to High** | Admins & secretaries (L00, L4) scanning tables, reviewing duplicates, approving batches. |

---

## 3. Color System & Design Tokens

### 3.1 Core Color Palette (Light & Dark)

| Role | Light Theme (HEX) | Dark Theme (HEX) | Description / Usage |
| --- | --- | --- | --- |
| **Primary** | `#004D40` (Deep Teal) | `#80CBC4` (Soft Mint Teal) | Primary actions, app bar accents, verified badges |
| **On Primary** | `#FFFFFF` | `#00332C` | Text/icons on primary surfaces |
| **Primary Container** | `#E0F2F1` | `#004D40` | Active filters, selected table rows |
| **On Primary Container** | `#00251A` | `#E0F2F1` | Text on primary container |
| **Secondary** | `#283593` (Deep Indigo) | `#9FA8DA` (Muted Periwinkle) | Secondary controls, category chips, navigation |
| **On Secondary** | `#FFFFFF` | `#1A237E` | Text on secondary surfaces |
| **Background** | `#F8F9FA` (Off-white) | `#121212` (True Charcoal) | Screen canvas |
| **Surface** | `#FFFFFF` (Pure white) | `#1E1E1E` (Dark Grey) | Card surfaces, modals, table bodies |
| **Surface Variant** | `#ECEFF1` | `#2C2C2C` | Form input backgrounds, dividers |
| **Outline / Border** | `#CFD8DC` | `#424242` | Input borders, card outlines |
| **Text Primary** | `#1C1B1F` (Near Black) | `#E6E1E5` (High Contrast White) | Headings, body copy, form labels |
| **Text Secondary** | `#49454F` | `#CAC4D0` | Captions, helper text, timestamps |

### 3.2 Sync & Status Badges (Semantic Colors)

| Status | Color (Light) | Color (Dark) | Badge Background | Meaning / Invariant |
| --- | --- | --- | --- | --- |
| **Draft** | `#546E7A` (Slate) | `#90A4AE` | `#ECEFF1` | Saved locally, not yet finalized |
| **Pending** | `#E65100` (Amber Orange) | `#FFB74D` | `#FFF3E0` | Completed, in outbox awaiting sync push |
| **Synced** | `#2E7D32` (Forest Green) | `#81C784` | `#E8F5E9` | Confirmed by server revision |
| **Rejected / Error** | `#C62828` (Crimson) | `#EF9A9A` | `#FFEBEE` | Server validation failed; requires user fix |
| **Duplicate Alert** | `#F57F17` (Gold Ochre) | `#FFF176` | `#FFFDE7` | Flagged by duplicate detection scoring |

---

## 4. Typography Scale

### 4.1 Font Families
- **Latin:** `Inter`, fallback `sans-serif`
- **Sinhala:** `Noto Sans Sinhala`, bundled in asset bundle
- **Tamil:** `Noto Sans Tamil`, bundled in asset bundle

### 4.2 Type Scale (Scalable up to 200% without clipping)

| Role | Size (sp) | Weight | Line Height (Latin) | Line Height (Sinhala / Tamil) |
| --- | --- | --- | --- | --- |
| **Display Large** | 32 | Bold (700) | 40 dp (1.25) | 48 dp (1.50) |
| **Headline Medium** | 24 | SemiBold (600) | 32 dp (1.33) | 38 dp (1.58) |
| **Title Medium** | 18 | Medium (500) | 24 dp (1.33) | 28 dp (1.55) |
| **Body Large (Inputs)** | 16 | Regular (400) | 24 dp (1.50) | 26 dp (1.62) |
| **Body Medium** | 14 | Regular (400) | 20 dp (1.43) | 22 dp (1.57) |
| **Label / Badge** | 12 | Medium (500) | 16 dp (1.33) | 18 dp (1.50) |

---

## 5. Spacing Rhythm & Geometry

- **Base Unit:** 4 dp
- **Spacing Scale:**
  - `xxs`: 4 dp (tight icon-text spacing)
  - `xs`: 8 dp (form field internal padding, chip padding)
  - `sm`: 12 dp (between related inputs)
  - `md`: 16 dp (standard screen horizontal margin, card padding)
  - `lg`: 24 dp (section spacing)
  - `xl`: 32 dp (major module separation)
  - `xxl`: 48 dp (bottom action bar height minimum)
- **Corner Radii:**
  - Buttons & Chips: 8 dp (clean modern chamfer, never pill-shaped blobs)
  - Form Fields: 6 dp
  - Cards & Containers: 8 dp
  - Dialogs & Sheets: 12 dp
- **Elevation:**
  - Flat/Bordered by default: `1 dp` border (`#CFD8DC`) preferred over heavy drop-shadows.
  - Dialog / Sheet: 4 dp elevation blur with 15% opacity scrim.

---

## 6. Accessibility & Invariants Floor (§4.2)

1. **Touch Targets:** Minimum **48 × 48 dp** for every clickable icon, button, checkbox, and dropdown target.
2. **200% Font Scale Immunity:** Every layout uses `Flexible`, `SingleChildScrollView`, or `ListView` — zero hardcoded fixed container heights on text wrappers.
3. **Form Fidelity:** The client form retains the exact logical sequence of paper forms DD/S/001/2026 and format files. Never hide fields behind accordion menus or obscure steps.
4. **TalkBack / Semantics:** Meaningful `Semantics` tags on all icon-only buttons (e.g., sync trigger, language toggle, logout).
