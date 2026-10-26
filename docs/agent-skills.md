# Agent Skills Registry

This document records the agent skills installed in the repository under `.agents/skills/` per Build Plan v1.2 §4.2 and task M0.10.

## Installed Skills

| Skill Directory | Source Repository | Scope / Purpose |
| --- | --- | --- |
| `dart-*` | `dart-lang/skills` / `flutter/agent-plugins` | Dart coding standards, unit tests, analysis, FFI, mock generation, primary constructors, pattern matching |
| `flutter-*` | `flutter/agent-plugins` | Flutter architecture, widget testing & previews, responsive layout, Riverpod bindings, JSON serialization, l10n, declarative routing |
| `design-taste-frontend` | `https://github.com/Leonxlnx/taste-skill` | Design aesthetics, typography hierarchy, cohesive theme, modern palette, spacing rhythm, micro-interactions |

## Rules of Precedence (Section 4.2)

1. **Precedence:** The Agent Build Plan (`DD-Campaign_Agent_Build_Plan.md`) and Technical Blueprint always supersede skill defaults in case of any conflict.
2. **Design Direction vs Implementation:**
   - `taste-skill` provides visual direction and aesthetic guidance. For mobile/Android field apps: variance **low**, motion **low**, density **low to medium** (touch targets ≥ 48dp, high contrast, low-end device performance). For web dashboard: variance **low**, motion **low**, density **medium to high**.
   - `flutter/agent-plugins` provides idiomatic Flutter code architecture, state management with Riverpod, widget tests, and responsive layout.
3. **Inviolable Invariants:**
   - Section 3 invariants (no data loss, server-enforced security, offline-first Drift storage, immutable audit columns, credential secrecy) must never be bypassed by any skill.
   - Form fidelity: the client form preserves the exact order and wording of DD/S/001/2026 and format files.
   - Accessibility floor: touch targets ≥ 48 dp, contrast compliant, usable at 200% font scale, Sinhala and Tamil line-heights unclipped, TalkBack semantics enabled.
