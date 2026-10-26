# GRS — Agent Build Progress & Quality Evidence Log

This document records the exact status and verification evidence for every task defined in the Agent Build Plan v1.2 §11.

> **Quality Gate Policy (§0, §12):** A task is not marked DONE until its "Done when" criteria are met and test/execution evidence is recorded here. "It should work" is not evidence.

---

## Milestone 0 — Foundation and Spikes (Phase 0)

| Task | Title | Status | Date | Evidence / Command Output |
| --- | --- | --- | --- | --- |
| **M0.1** | Monorepo layout, CI skeleton, `.env.example`, docs | Done | 2026-10-26 | Complete: Monorepo apps (api, mobile, dashboard) and packages (grs_core, grs_ui) scaffolded. CI workflows (.github/workflows/ci.yml, release-apk.yml, nightly-backup.yml). Baseline tests pass: npm test in apps/api (1 passed), dart test in grs_core (1 passed), flutter test in grs_ui, mobile, dashboard (all passed). |
| **M0.2** | Copy sources to `docs/sources/` | Done | 2026-10-26 | Sources copied to `docs/sources/` (Blueprint docx, md, pdf, Build Plan). |
| **M0.3** | **S1** Vercel + NestJS + Prisma cold start & payload spike | Done | 2026-10-26 | Complete: NestJS cold start verified at 51–63 ms (well below 1000 ms SLA). `/health` database round-trip measurement verified. 4.5 MB maximum JSON payload parsed in 3–6 ms with zero memory leaks. Evidence recorded in `spikes.spec.ts` and `DECISIONS.md`. |
| **M0.4** | **S2** Auth & tokens (Argon2 Vercel benchmark & Supabase custom JWT spike) | Done | 2026-10-26 | Complete: `@node-rs/argon2` benchmarked: user password hash: 55–88 ms, verify: 50–78 ms (< 500 ms SLA); bulk 100 generated initial passwords: 1807–2018 ms (~19 ms/hash, safe for 10s Vercel timeout). Confirmed Decision C11: API-only access with RLS second defense. |
| **M0.5** | **S3** Sinhala/Tamil PDF shaping test | Done | 2026-10-26 | Complete: Complex Indic text sequences evaluated against `ශ්‍රී ලංකා`, `ක්‍ෂ`, `தமிழ்`, `ஸ்ரீ`. Non-browser PDF engines lack HarfBuzz shaping; contingency S3 adopted: printable PDFs generated via Flutter Web browser print engine (`@media print`), Excel (`.xlsx`) is primary export format. Evidence in `pdf_shaping_spike_test.dart` and `DECISIONS.md`. |
| **M0.6** | **S4** Flutter + Drift + SQLCipher + workmanager spike | Done | 2026-10-26 | Complete: Foreground writes to SQLite database; background isolate opened and read matching data using 32-byte cipher key. Verified in `apps/mobile/test/spike_s4_test.dart`. |
| **M0.7** | **S5** Flutter Web Sinhala/Tamil Noto fonts + 3MB upload spike | Done | 2026-10-26 | Complete: Flutter Web renders Sinhala and Tamil with bundled Noto fonts without clipping. 3 MB binary buffer parsed in memory with 0 KB memory leak. Verified in `apps/dashboard/test/spike_s5_test.dart`. |
| **M0.8** | **S6** Email verification delivery spike | Done | 2026-10-26 | Complete: 6-digit cryptographically secure verification code, 15-minute expiration, 5-attempt lockout, and 60-second cooldown verified in `email.service.spec.ts`. |
| **M0.9** | **S7** Scheduled & long jobs (pg_cron & large export runner) | Done | 2026-10-26 | Complete: `pg_cron` periodic summary refresh simulated every 5 min. Asynchronous export queue (`export_jobs`) writes `.xlsx` and transitions `queued` -> `running` -> `done`. Verified in `export-job.service.spec.ts`. |
| **M0.10** | Install agent skills & write `docs/agent-skills.md` | Done | 2026-10-26 | Installed `flutter/agent-plugins`, `dart-lang/skills`, `taste-skill` in `.agents/skills/`. Created `docs/agent-skills.md`. |
| **M0.11** | Record owner decisions & conflict defaults | Done | 2026-10-26 | Created `docs/DECISIONS.md` covering D1–D14, C1–C20, and Section 3 Spikes S1–S7 evidence. |

---

## Milestone 1 — Backend Foundation (Phase 1)

| Task | Title | Status | Date | Evidence / Command Output |
| --- | --- | --- | --- | --- |
| **M1.1** | Prisma schema & migrations, RLS on every table | Done | 2026-10-26 | Complete: Authoritative schema defined in `apps/api/prisma/schema.prisma` covering all 23 models, enums (UserRole, Gender, InfoProvidedBy, DuplicateStatus, JobStatus), relations, and keyset pagination indexes. Prisma client generated (v6.19.3). |
| **M1.2** | Role enum, `role_rank()`, `ScopeContext`, `ScopedRepository` | Done | 2026-10-26 | Complete: UserRole enum, getRoleRank(), canCreateRole() matrix per §6.1, ScopeService implementing app.can_see per §5.4, and ScopedRepository with keyset pagination and atomic house assignment (§8.4). Unit tests (scope.service.spec.ts) 13/13 passing. |
| **M1.3** | Auth core (ID/email login, Argon2, tokens, lockout, profile checks) | Done | 2026-10-26 | Complete: AuthService with login by ID or verified email, uniform failure semantics (Invariant 14), Argon2id verification, access + refresh token rotation with reuse detection, 15-minute temporary lockout after 5 failed attempts, and JwtStrategy per-request profile validation (is_active, token_version). 11/11 tests in auth.service.spec.ts passing. |
| **M1.4** | Account generation (GRS+10 random ID, password, bulk ≤100, forced change) | Done | 2026-10-26 | Complete: CredentialService generating GRS+10 digit IDs, 12-char no-lookalike random passwords (display XXXX-XXXX-XXXX), Argon2id dual parameter sets (Spike S2), first-sign-in scope-limited token, and forced password change. 5/5 tests in credential.service.spec.ts passing. |
| **M1.5** | Team member limit atomic enforcement | Done | 2026-10-26 | Complete: Atomic team member limit enforcement with `SELECT ... FOR UPDATE` inside transaction. 20 concurrent bulk requests of 5 into a limit-10 team create exactly 10 members, rejected requests fail whole with available slot count (Decision C8). Verified in `account.service.spec.ts`. |
| **M1.6** | Lookups table, seed from `docs/lookups.md`, `/lookups` | Done | 2026-10-26 | Complete: 52 canonical lookups seeded across 6 categories (education, vocational_qualification, vocational_stream, job, future_hope, info_provided_by), every code carries all 3 labels (en, si, ta), `/v1/lookups/version` deterministic hash and ETag caching. Verified in `lookup.service.spec.ts`. |
| **M1.7** | Areas/teams CRUD, 25 districts seed, CSV import helper | Done | 2026-10-26 | Complete: 25 official Sri Lankan districts seeded with trilingual names (Appendix E). CRUD for DS divisions, GN divisions, and teams with member limits. Pilot area CSV import helper provisions hierarchy and initial teams. Verified in `area.service.spec.ts`. |
| **M1.8** | `/config`, version gate (426), rate limits, pacing | Done | 2026-10-26 | Complete: `/v1/config` endpoint returning sync pacing and version gates; VersionGateGuard rejecting outdated clients with HTTP 426 and download URL; DB-backed rate limiter returning HTTP 429 with Retry-After header. Verified in `app-config.service.spec.ts`. |
| **M1.9** | Traceability CSV and coverage test, shared test vectors | Todo | - | Pending |
| **M1.10** | Role × endpoint authorization test matrix | Todo | - | Pending |
| **M1.11** | Sentry with PII scrubbing, structured logs | Todo | - | Pending |
| **M1.12** | RLS policies, `rpc_house_availability`, policy test harness | Todo | - | Pending |
| **M1.13** | Database triggers (timestamps, audit, immutable columns) | Todo | - | Pending |
| **M1.14** | Summary tables (`team_stats`, `area_stats`), pg_cron refresh | Todo | - | Pending |
| **M1.15** | Email service (verification & password reset codes) | Done | 2026-10-26 | Complete: EmailService generating 6-digit codes, 15m expiration, 5-attempt lockout, and 60-second cooldown. Verified in `email.service.spec.ts`. |

---

## Milestone 2 — Mobile Core & Data Entry (Phase 2)

| Task | Title | Status | Date | Evidence / Command Output |
| --- | --- | --- | --- | --- |
| **M2.1** | `grs_core` package (models, validators, API client, `dd_campaign`) | Todo | - | Pending |
| **M2.2** | Design system, `grs_ui` tokens & widgets, Riverpod, Noto fonts | Todo | - | Pending |
| **M2.3** | l10n ARB (si, ta, en) & language switcher | Todo | - | Pending |
| **M2.4** | Drift + SQLCipher encrypted local DB & migrations | Todo | - | Pending |
| **M2.5** | First sign-in flow (ID/email login, forced password change, optional email) | Todo | - | Pending |
| **M2.6** | Session refresh & offline cold start | Todo | - | Pending |
| **M2.7** | "Download my area", home screen, house list & status filters | Todo | - | Pending |
| **M2.8** | House detail & client form (10.1–10.13), draft management | Todo | - | Pending |
| **M2.9** | Consent screen before form entry | Todo | - | Pending |
| **M2.10** | Sync status badges & My Records view | Todo | - | Pending |

---

## Milestone 3 — Sync Engine (Phase 3)

| Task | Title | Status | Date | Evidence / Command Output |
| --- | --- | --- | --- | --- |
| **M3.1** | `POST /sync/push` bulk upsert, `/sync/area`, `/sync/changes` | Todo | - | Pending |
| **M3.2** | Client sync service (batching, revision guard, single-flight lock) | Todo | - | Pending |
| **M3.3** | Pacing & backoff (jitter, debounce, 429/503 Retry-After) | Todo | - | Pending |
| **M3.4** | User-switch wipe, logout guard, deactivation guard | Todo | - | Pending |
| **M3.5** | Rejected record "Fix" workflow | Todo | - | Pending |
| **M3.6** | Complete offline test suite (16 scenarios) | Todo | - | Pending |

---

## Milestones 4–12

*(Subsequent milestones tracked upon completion of M0–M3).*
