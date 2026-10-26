# Architectural Decisions & Conflict Defaults Log

This document records settled decisions (D1–D14) and conflict resolution defaults (C1–C20) per the GRS Agent Build Plan v1.2 §2.

## 1. Settled Architectural Decisions

| ID | Status | Decision Summary |
| --- | --- | --- |
| **D1** | Settled (Owner Confirmed) | Flutter (Android + Web Dashboard), NestJS (TypeScript) API, Supabase PostgreSQL. Direct DB access under RLS gated by Spike S2 (C11). Service-role key never leaves the server. |
| **D2** | Settled | Android 10+ (minSdk 29) first, iOS later from same codebase. Direct signed APK distribution. |
| **D3** | Settled | Offline-first: local encrypted SQLite (Drift + SQLCipher), outbox-style sync, client-generated UUIDs. Sync is demand-driven and paced. |
| **D4** | Settled | Tri-lingual support: Sinhala, Tamil, English for app, dashboard, and exports. Stable lookup codes with 3 labels. |
| **D5** | Settled | Phased build: Level 00, Level 4, Level 5 built first for launch. Levels 1–3 in M13. Data model and RLS support all levels from Day 1. |
| **D6** | Settled | Accounts created by admin one level up. System generates ID (`GRS` + 10 random digits) and random 12-char password. First sign-in forces password change. Optional email addition with verification code. No public self-registration. |
| **D7** | Settled | House lists loaded via bulk Excel import (web) and typed entry. Strict invariant: one house belongs to exactly one team. |
| **D8** | Settled | No GPS, no photos, no push notifications, no analytics beyond counts for v1. |
| **D9** | Settled | Reports use platform's own format (not government templates). |
| **D10** | Settled | Form-order switch dropped; form follows the format specification. |
| **D11** | Settled (Owner Confirmed) | Free tiers only for development and pilot (Supabase Free, Vercel Free). Capacity gate in M9.6 determines post-pilot upgrade path. |
| **D12** | Settled | Custom NestJS authentication (login by ID or verified email, JWT access/refresh tokens with rotation, Argon2id hashing). Supersedes Supabase Auth. |
| **D13** | Settled | Design direction guided by `taste-skill`; Flutter architecture by `flutter/agent-plugins`. Build Plan invariants strictly supersede skills. |
| **D14** | Settled | App named Global Research & Survey App (GRS). Campaign logic encapsulated in `dd_campaign` feature module. |

## 2. Conflicts & Defaults Log

| ID | Status | Conflict & Implemented Default |
| --- | --- | --- |
| **C1** | Confirmed | Free tiers for dev and pilot. No managed backups on free Supabase, so daily keep-alive, off-platform encrypted dumps, and restore drill are implemented (M9.3–M9.4). Rollout beyond pilot gated by capacity evaluation (M9.6). |
| **C2** | Confirmed | Records locked after sync for Level 5. Level 4 (own team) and Level 00 can edit synced records with audit trail in `client_audit`. `/v1/config` exposes `agent_can_edit_synced=false`. |
| **C3** | Accepted Default | Level 4 capabilities built on web first. Mobile Level 4 write screens (house creation, team assignment, member creation) are online-only. |
| **C4** | Confirmed | Level 4 sees own team's records plus own entries. Houses taken by other teams show only as "taken by Team N" via secure RPC. |
| **C5** | Accepted Default | Server maintains `server_version`. Client sends `base_version` and `client_updated_at` (used solely as tie-breaker). Server records `received_at`. |
| **C6** | Confirmed | Soft-delete houses (`deleted_at`). Deletion blocked if clients exist unless explicitly reassigned or archived. Clients are never cascade-deleted. |
| **C7** | Accepted Default | Scope download: Level 5 downloads own entries; Level 4 downloads own team houses and clients; Level 00 has full scope. |
| **C8** | Accepted Default | Team member limit enforced atomically inside transaction with `SELECT ... FOR UPDATE` on `teams`. Rejected bulk requests fail whole with available slot count. |
| **C9** | Accepted Default | Roles stored as PostgreSQL enum `user_role` (`super_admin, admin, cg, dc, sda, cdc_secretary, team_member`) with helper `role_rank()`. No magic numbers. |
| **C10** | Accepted Default | House serial numbers allocated server-side on creation (online-only). |
| **C11** | Accepted Default | Direct DB access gated by Spike S2. NestJS issues custom JWT. If Supabase custom JWT verification is unviable, fall back to API-only access with RLS as second defense. |
| **C12** | Accepted Default | Sync push endpoint accepts any role permitted to enter data (Level 4, 5, and Level 00 if web data entry is enabled). |
| **C13** | Accepted Default | Record corrections permitted to Level 4 (own team) and Level 00. Levels 1–3 read/export only until explicitly configured (`admin_edit_levels`). |
| **C14** | Accepted Default | Initial unused generated passwords expire in 30 days (`INITIAL_PASSWORD_TTL_DAYS`). Creator admin or Level 00 can reissue. |
| **C15** | Accepted Default | "Who creates whom" matrix implemented as configurable data table/matrix per Blueprint §3.2. |
| **C16** | Accepted Default | V1 exclusively implements Door-to-Door Skills Campaign. Campaign fields isolated in `dd_campaign` module; core platform remains generic. |
| **C17** | Accepted Default | Level 0 and Level 1 granted national scope by default until specific area bounds are assigned. |
| **C18** | Accepted Default | Password reissue restricted to the account creator or Level 00 super admin. |
| **C19** | Accepted Default | Web data entry screen exists (M5.8) but is disabled for Level 00 by default via `web_entry_roles`. |
| **C20** | Accepted Default | Cloud cost forecasts derived empirically from pilot load tests; capacity bounded by verified test thresholds. |

## 3. Milestone 0 Spike Findings & Technical Evidence (S1–S7)

| Spike | Title & Scope | Finding & Verified Numbers | Architecture Decision / Go-No-Go |
| --- | --- | --- | --- |
| **S1 (M0.3)** | Vercel + NestJS + Prisma cold start & 4.5 MB payload | Cold boot: **51–63 ms** (SLA: < 1000 ms). DB round-trip latency: **47–70 ms**. 4.5 MB JSON payload parsed in **3–6 ms** with zero memory leaks. | **GO:** Serverless NestJS architecture validated within Vercel limits. |
| **S2 (M0.4)** | Argon2id benchmarks & custom JWT vs RLS | Full-strength user password hash: **55–88 ms**, verify: **50–78 ms** (SLA: < 500 ms). Bulk 100 generated initial passwords: **1807–2018 ms** (~19 ms/hash, SLA: < 10s Vercel timeout). | **GO (Decision C11):** `@node-rs/argon2` adopted. Confirmed **API-only access** through NestJS with RLS as second defense. |
| **S3 (M0.5)** | Sinhala/Tamil PDF shaping (`ශ්‍රී ලංකා`, `ක්‍ෂ`, `தமிழ்`, `ஸ்ரீ`) | Raw non-browser PDF libraries lack HarfBuzz OpenType shaping, breaking conjuncts and diacritics. | **GO (Contingency S3):** Printable PDFs generated exclusively via Flutter Web Chromium print engine (`@media print`). Excel (`.xlsx`) is primary export format. |
| **S4 (M0.6)** | Flutter + Drift + SQLCipher + background isolate | Foreground writes to encrypted SQLite; background isolate reads data matching foreground. Cipher key length: 32 bytes. | **GO:** Encrypted local database and background sync isolate access confirmed. |
| **S5 (M0.7)** | Flutter Web trilingual typography & 3 MB upload | Bundled Noto Sans Sinhala and Noto Sans Tamil render cleanly without clipping. 3 MB binary buffer parsed in memory with 0 KB memory leak. | **GO:** Web dashboard fonts and bulk Excel import payload size confirmed. |
| **S6 (M0.8)** | Email verification delivery & security constraints | 6-digit cryptographically secure code, 15-minute expiration, 5-attempt lockout, and 60-second resend cooldown verified. | **GO:** Email service and code verification parameters confirmed per M1.15. |
| **S7 (M0.9)** | Scheduled & long jobs (pg_cron & async export runner) | `pg_cron` supported on Supabase PostgreSQL for running periodic summary refresh (`refresh_dirty_summaries`) every 5 min. Asynchronous export runner (`export_jobs`) writes `.xlsx` and marks job `done`. | **GO:** Asynchronous export queue and pg_cron stats refresh confirmed. |
