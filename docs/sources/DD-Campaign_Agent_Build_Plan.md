# GRS (Global Research & Survey App) — Agent Build Plan

*First survey: Door-to-Door Skills Campaign, forms DD/S/001/2026 and DD/S/002/2026 · Flutter (Android first) + NestJS + Supabase · Offline-first*
*Plan v1.2 · 25 October 2026 · Built from: Technical Blueprint **v1.3**, `Format_.pdf` (admin-panel format), photos of both paper forms. Replaces plan v1.1.*

---

## 0. How to use this plan (read first, every session)

This file is the **work order for coding agents** (Claude Code or similar). It tells an agent *what to build, in what order, with what rules, and how to prove it is done*.

1. Read sections 1–4 once per session. They are short and they prevent most mistakes.
2. Pick the next task whose dependencies are done (section 11). Do **one task at a time**.
3. For each task: write the failing test first, implement, run the quality gates (section 12), then record evidence in `docs/PROGRESS.md`.
4. A task is **not done** until its "Done when" column is true and the test output is pasted into the progress log. "It should work" is not evidence.
5. If you hit a **STOP-AND-ASK trigger** (section 14), stop and write the question in `docs/OPEN-QUESTIONS.md`. Do not guess.
6. **Read section 4.2 before touching any UI.** Design and Flutter skills are installed in M0.10 and are subordinate to this plan.
7. **Never invent** field names, dropdown values, area data, translations, legal text or package versions. Use the traceability tables (section 7) and verify versions on npm / pub.dev / official docs at the time of use. Your training data may be stale.

---

## 1. Project snapshot and source precedence

**What it is:** GRS lets field teams collect survey data on an Android phone, **offline**, into one central database. Its first survey is the Door-to-Door Skills Campaign: agents visit houses and record each person's education, vocational background, interests and welfare status. **Every level from 0 to 5 can use the Android app and enter data; Level 00 works on the web; the web dashboard serves all levels (Level 00 first).** Accounts are **created by an admin one level up** with a generated ID and password (no self-registration). Sinhala, Tamil and English throughout.

**Build order (blueprint v1.3):** Level 00, Level 4 and Level 5 first, then launch. Levels 1–3 follow (M13). Level 0 waits for a client decision. **The data model, scope functions and RLS are built for all levels from day one**, so M13 adds screens and creation rules, not schema changes.

**Scale:** long-term goal **50,000 to 1,000,000 agents**; the first launch is smaller (number not yet given). Busiest hours are probably 10:00–15:00. Records per agent per day are unknown. Section 8.5 builds the scale habits in from day one and M9 proves them. Sizes are **parameters, never constants**.

**Source precedence when documents disagree** (highest first):

1. Latest explicit owner answer in `docs/OPEN-QUESTIONS.md` / `docs/DECISIONS.md`
2. `Format_.pdf` (admin-panel format: levels and field lists)
3. Technical Blueprint v1.3
4. Paper forms (DD/S/001, DD/S/002). The owner agreed to follow the format file over paper form 002.

**Known typos in the format file. Do not copy them into code or UI:** "Heist" = Highest, "Fether Hopes" = Future hopes, "Froing Job" = Foreign job, "Campain" = Campaign, "Gramanilarari" = Grama Niladhari, "SAmurdhi/Asswesuma" = Samurdhi/Aswesuma, "Distrct" = District. The format file's "Director CG" is **Admin CG** in blueprint v1.3.

**Sample data in the format file is illustrative only.** Its team grouping table violates the "one house, one team" rule (house 28 is in Teams 1 and 2; 29 in Teams 1 and 3; 36, 54 and 63 in Teams 2 and 3; 56 appears three times in Team 3). Never seed it. Use it only as a **negative test fixture** for that rule.
---

## 2. Decisions, conflicts and defaults

### 2.1 Settled (do not reopen)

| # | Decision |
| --- | --- |
| D1 | Flutter (mobile + web dashboard), NestJS (TypeScript) API, Supabase PostgreSQL. **Owner decision:** the apps talk to the API *and* directly to the Supabase database under Row Level Security (section 5.5). Direct access is **gated by spike S2** (see C11). The service-role key never leaves the server. |
| D2 | Android 10+ (minSdk 29) first, iOS later from the same code. Direct signed APK. |
| D3 | Offline-first: local encrypted SQLite (Drift + SQLCipher), outbox-style sync, client-generated UUIDs. Syncing is **demand-driven and paced** (section 8.5). |
| D4 | Languages: Sinhala, Tamil, English for app, dashboard, exports. Lookup values stored as stable codes with three labels. |
| D5 | Build order: Level 00, 4, 5 first; Levels 1–3 after launch (M13); Level 0 undecided. Data model and RLS support all levels from the start. |
| D6 | **Accounts are created by an admin one level up**, one at a time or in bulk. The system generates an **ID `GRS` + 10 random digits** and a **random password**. First sign-in needs internet and forces a new password. The person may add an email (verified by a code) and then sign in with either ID or email. **No shared start-up login, no self-registration, no approval step** (blueprint v1.3 replaced them). |
| D7 | House list by Excel import (web) and typed entry. One house belongs to one team only. |
| D8 | No GPS, no photos, no push notifications, no analytics beyond counts (v1). |
| D9 | Reports are this platform's own (not a government format). |
| D10 | Form-order switch dropped. Follow the format file. |
| D11 | **Free tiers only for now** (Supabase free, Vercel free). Upgrade later if possible; nothing may depend on a paid feature. The long-term scale **cannot** run on free tiers, so M9.6 sets a hard capacity gate (see C1). |
| D12 | **Authentication is built in NestJS** (blueprint v1.3): login by ID or email, JWT access + refresh tokens, Argon2 password hashes. This **supersedes plan v1.1's Supabase Auth** because ID login, forced first change, unused-password expiry and lockout are simpler and cheaper to run at scale in our own code. |
| D13 | **UI/UX generation and Flutter standards:** agents use [`taste-skill`](https://github.com/Leonxlnx/taste-skill) (`Leonxlnx/taste-skill`) for design direction and aesthetic quality (anti-slop guidelines, typography hierarchy, cohesive theme, modern palette, spacing rhythm, micro-interactions) and [`flutter/agent-plugins`](https://github.com/flutter/agent-plugins) (official Flutter team agent plugins and skills) for Flutter implementation (idiomatic architecture, performant widget trees, widget tests/previews, responsive layouts, Riverpod state bindings). **Rules for using them are in section 4.2; this plan wins any conflict.** |
| D14 | The app is named **GRS**. The Door-to-Door Skills Campaign is its first survey. v1 builds **no generic survey/form builder**. Campaign code lives in its own feature module so a later survey can be added without rewriting the core (see C16). |

### 2.2 Conflicts between sources, with the default the agent must use

Rows marked ✅ were **confirmed by the owner on 25 Oct 2026**; the others are defaults he accepted or defaults for blueprint v1.3 changes **he has not yet answered**. Record all of them in `docs/DECISIONS.md` (M0.11). Each default is reversible (config flag or isolated module).

| ID | Conflict | Default the agent implements |
| --- | --- | --- |
| C1 ✅ | Blueprint v1.3 recommends a **paid** Supabase plan sized by load tests. **Owner decision: free tiers only for now.** | Free tiers for development and pilot. Never depend on a paid-only feature. The free tier has **no managed backups and can pause**, so the plan adds a daily keep-alive, an own daily encrypted dump stored off-platform, and a restore drill (M9.3–M9.4). **Capacity gate (M9.6):** the free tier's database size, egress, connections and storage are checked against the pilot numbers; **no rollout beyond the pilot until the owner has the numbers and an upgrade path in writing.** Upgrading is configuration only. |
| C2 ✅ | Records after sync. | **Locked for Level 5. Level 4 (own team) and Level 00 can edit**, with an audit row. Enforced by the API and the database. `/v1/config` exposes `agent_can_edit_synced=false`. |
| C3 | Blueprint v1.3: Level 4 uses mobile (and web). | Build every Level 4 capability on web first. Mobile Level 4 write screens (house creation, team assignment, account creation) are **online-only**. |
| C4 ✅ | What Level 4 sees. | **Own team's records plus own entries** (blueprint §3.3). For other teams' houses, only house no. and "taken by Team N". |
| C5 | "Last edit wins by `updated_at`" vs unreliable phone clocks. | Server keeps `server_version`. Client sends `base_version` and `client_updated_at` (tie-breaker only). Server stores `received_at`. |
| C6 ✅ | Level 4 can delete houses; clients hang off houses. | Soft-delete houses. Block deletion if it would orphan clients unless the user picks **Reassign** or **Archive with clients**. Clients are never cascade-deleted. |
| C7 | Which clients each level downloads and sees. | Level 5: own entries. Level 4: own team plus own. Levels 0–3 (later): own area and below plus own. Level 00: all. Phones download only their own team's houses and their own clients. |
| C8 | Team member limit. | Checked **when an admin creates members** (single or bulk), inside one transaction with a lock on the team row. Counts **active** members. Deactivated members free a slot. A bulk request that would exceed the limit is **rejected whole** with the free-slot count. |
| C9 | Role storage. | Postgres enum `user_role` (`super_admin, admin, cg, dc, sda, cdc_secretary, team_member`) plus `role_rank()`. No magic numbers. `admin` is Level 0. |
| C10 | Level 4 house creation needs an auto serial number. | **Online-only**, serial allocated on the server. |
| C11 | Owner wants direct database access (D1); blueprint v1.3 keeps NestJS-issued tokens (D12). | **Both.** NestJS mints the access token in a form Supabase can verify, so RLS policies can use the token's `sub` (spike S2: use the method the current Supabase docs describe for custom or imported JWT signing keys). **If S2 fails, direct access is switched off:** apps read through the API only, and section 5.5 stays as the second security layer the blueprint already requires. |
| C12 | Blueprint v1.3: Levels 0 to 4 enter data. | Sync push accepts any role that may enter data. In v1 that is Level 4 and Level 5 (and Level 00 only if C19 turns web entry on). |
| C13 | Who may correct synced records. | Level 4 (own team) and Level 00. Levels 1–3, when they exist, **read and export only** until the owner says otherwise (config `admin_edit_levels`). |
| C14 | "Passwords never used expire after a set time" (period not given). | Initial password expires **30 days** after creation (`INITIAL_PASSWORD_TTL_DAYS`). Applies only until the first successful sign-in. Admin reissues. |
| C15 | Blueprint §3.2 says "who creates whom" is the blueprint's own reading of the client's note. | Implement the table exactly as written in section 6.1 as **data** (a permission matrix), so a correction is a data change. |
| C16 | Will GRS host surveys beyond the Door-to-Door Skills Campaign in the first release? Not stated. | **No.** Keep campaign code in a `dd_campaign` feature module and keep generic parts (accounts, areas, teams, sync, exports) free of campaign words. |
| C17 | Level 0 role is undecided. Level 1's area is not defined. | Level 0 and Level 1 get **national scope** (optionally limited to assigned districts by `profile_areas` later). No Level 0 screens until decided. |
| C18 | Who may reissue a password. | The admin who created the account, or Level 00. |
| C19 | Level 00 "Enters data: not stated". | Web data entry exists (M5.8) but is **off for Level 00 by default** (config `web_entry_roles`). |
| C20 | Paid plan costs and the 1M-agent goal. | Costs are estimated from pilot numbers (M9.7). No capacity promise beyond what M9.2 and M9.6 prove. |

### 2.3 Human blockers (agent proceeds with the stated stand-in, never with invented data)

| # | Needed from owner | Needed by | Stand-in while waiting |
| --- | --- | --- | --- |
| B1 | The **dropdown lists** (education, vocational qualification, vocational stream, jobs). **The owner will supply them himself when the project is created** (into `docs/lookups.md`). | M1.6 | Seed file with code `TODO_OWNER` rows only. Draft education ladder in Appendix F, marked draft. |
| B2 | Consent statement wording (Sinhala/Tamil/English) and PDPA data-controller name | M2.9 | Placeholder key `consent.v0`, flagged `DRAFT` in the UI. |
| B3 | Pilot area data: district, DS, GN numbers/names, team numbers and member limits | M1.7 | Fixture area `TEST-GN-001`, never shipped to production. |
| B4 | Email provider (with a free tier) and a sending domain (SPF/DKIM). Email is used only for **verifying an added email and for password reset**, but at scale the volume needs a plan sized for it. | M1.15 | Console mail driver in dev. |
| B5 | Native-speaker review of Sinhala and Tamil strings | M8 | Machine drafts allowed, every string tagged `review: pending`. |
| B6 | Report layouts and sign-off | M7 | Section 10 default report set. |
| B7 | Real election name-list sample for the Excel template check | M5.4 | Synthetic file. |
| B8 | Required-field matrix confirmation (Appendix A defaults) | M2.8 | Appendix A defaults. |
| B9 | Expected agents at first launch, growth path, and **records per agent per day** (blueprint open question) | M9.2 | Parameterised load test with illustrative numbers (section 12.6). |
| B10 | Level 0 role decision; meaning of Level 1–3 "own team members"; Level 1's area | M13 only | Not built. |
| B11 | Confirm the "who creates whom" table (section 6.1) and the 30-day initial password expiry | M1.4 | Defaults in C14, C15. |

---
---

## 3. Non-negotiable invariants

An agent that violates one of these has produced a defect, even if the tests pass.

1. **No citizen data is ever lost.** A local record is never deleted or overwritten until the server has confirmed that exact revision.
2. **Idempotent sync.** Sending the same record twice never creates two rows (UUID upsert).
3. **The server side enforces everything.** The API **and** the database (Row Level Security, triggers, constraints) enforce roles, area scope, team limits, "one house one team" and locked records. The apps' checks are convenience only.
4. **Area scope on every query.** No controller touches Prisma directly. All API data access goes through a repository that **requires** a `ScopeContext`. Direct database access (if S2 passes) is scoped by RLS policies that implement the same rules; one test suite proves the API and RLS agree.
5. **No server secrets in apps.** The apps hold only `API_BASE_URL` and a Sentry DSN, plus `SUPABASE_URL` and the **public anon key** if and only if direct access is enabled. Never the service-role key, JWT signing secrets or SMTP keys. CI scans every app and web build.
6. **No PII in logs, crash reports or analytics.** No names, phones, addresses, IDs-with-passwords or passwords in API logs, Sentry events or breadcrumbs. Log record IDs only.
7. **No extra Android permissions.** The release manifest permits only `INTERNET` and `ACCESS_NETWORK_STATE` (plus what workmanager and secure storage need on their own). CI fails if more appear.
8. **UTF-8 and Unicode safety end to end.** Sinhala and Tamil round-trip unchanged through Excel, API, database, PDF and CSV. Normalize to NFC for storage. Keep ZWJ/ZWNJ and strip them **only** when building comparison keys.
9. **Spreadsheet-injection safe exports.** Any exported cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
10. **Soft delete only** for houses and clients.
11. **Every write is attributable.** `created_by`, `updated_by`, timestamps and `device_id` on every record. Corrections write an audit row. Account actions write `account_audit`.
12. **Dates:** store UTC; display in Asia/Colombo.
13. **Credentials are shown once.** A plaintext initial password exists only in memory while the creation response is built, and on the creating admin's screen or downloaded sheet. It is **never** stored (database, Storage, logs, Sentry, crash dumps), never returned twice. Only the Argon2 hash is stored. Test: scan logs, database and error reports for the passwords used in tests.
14. **Login never reveals whether an ID or email exists.** Same message, same status and similar timing for unknown ID, wrong password, locked and expired accounts (see 12.3).
15. **The server paces the phones.** No fixed-interval syncing, random delay before background sync, batching, and obey `429/503` with `Retry-After` (section 8.5).
16. **Big-table rules.** Keyset pagination only (never OFFSET). Every list is area-filtered. Dashboards read **summary tables**, never `count(*)` over millions of rows. Batches are saved with **one bulk statement**, never a query per record.

---
---

## 4. Repository, tooling and environments

### 4.1 Layout and tooling

```
grs/
├─ apps/
│  ├─ api/            # NestJS + Prisma
│  ├─ mobile/         # Flutter Android app (all levels; Level 00 uses web)
│  └─ dashboard/      # Flutter Web (all levels; Level 00 first)
├─ packages/
│  ├─ grs_core/       # Dart: models, API client, validators, l10n ARB, lookup codes, dd_campaign feature module
│  └─ grs_ui/         # Dart: shared design tokens and widgets (mobile + dashboard)
├─ docs/
│  ├─ PROGRESS.md  DECISIONS.md  OPEN-QUESTIONS.md  lookups.md  agent-skills.md
│  ├─ design/DESIGN.md
│  ├─ test-vectors/   # validation.json, phones.json, duplicates.json, ids.json (shared by API and Dart tests)
│  └─ runbooks/       # backup-restore.md, release-apk.md, reissue-credentials.md, scale-rollout.md
├─ .agents/skills/    # installed agent skills, committed and pinned (section 4.2)
├─ .github/workflows/ # ci.yml, release-apk.yml, nightly-backup.yml
└─ vercel.json
```

| Concern | Rule |
| --- | --- |
| Flutter | Pin the SDK version in `.fvmrc` or CI. Riverpod, go_router, Drift (+ `sqlcipher_flutter_libs`), connectivity_plus, workmanager, flutter_secure_storage, intl/ARB, `supabase_flutter` (**only if S2 passes**: direct reads under RLS), Sentry. **Do not include both `sqlite3_flutter_libs` and `sqlcipher_flutter_libs`.** They conflict. |
| API | NestJS, Prisma (migrations via `DIRECT_URL`, runtime via pooler `DATABASE_URL`), class-validator, Swagger, ExcelJS, Argon2 (library chosen in spike S2), JWT library, SMTP client, Sentry. |
| Vercel | Function region near the Singapore database (e.g. `sin1`). Check current Vercel NestJS and limits docs before wiring. Free-plan cron is daily at best, so frequent jobs use `pg_cron` (spike S7). |
| Config | `.env.example` committed, real values only in Vercel/GitHub secrets. API env: `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_KEY` (and public key if asymmetric, per S2), `JWT_REFRESH_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (only if direct access is enabled), `SUPABASE_SERVICE_ROLE_KEY` (server only: Storage), `SMTP_URL` or `EMAIL_API_KEY`, `SENTRY_DSN`, `ANDROID_MIN_VERSION`, `INITIAL_PASSWORD_TTL_DAYS`. |
| Environments | `local` (Docker Postgres or Supabase CLI), `staging` (Supabase free), `production` (Supabase free for now, upgrade later). Separate keys per environment. |
| Android signing | One release keystore. **Back it up in two secure places.** Losing it means no user can ever update the APK. Never commit it. |
| Branching | Trunk-based, short branches, conventional commits, squash merge. CI must be green. |

### 4.2 Design and Flutter agent skills (owner decision D13)

**Install (task M0.10).** Commands as published by the repositories on 25 Oct 2026. Re-check their READMEs when you run them.

```bash
# Flutter skills (official Flutter team)
npx skills add flutter/agent-plugins --skill '*' --agent universal --yes
npx skills add dart-lang/skills --skill '*' --agent universal --yes
# or, in Claude Code: claude plugin marketplace add flutter/agent-plugins
#                     claude plugin install dart-flutter@dart-flutter
# Design taste skill (v2 is the default and is marked experimental; v1 is design-taste-frontend-v1)
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

taste-skill's v2 needs Node 22+ and Chrome, Edge or Chromium. Commit the installed `.agents/skills/` folder and record each skill's source, version or commit in `docs/agent-skills.md`, so every agent session and every lane uses the **same** copy.

**How to use them**

- **`flutter/agent-plugins`** governs *how the Flutter code is written*: architecture, widget composition, performance, responsive layouts, widget tests and previews, Riverpod bindings. Its skills describe a "happy path". Where this plan is stricter (offline rules, sync, security), this plan wins.
- **`taste-skill`** governs *how the interface looks and feels*: visual hierarchy, typography scale, spacing rhythm, a cohesive palette, polish and micro-interactions, and avoiding generic "AI-looking" output. It is written mainly for **web frontends** (React, CSS, GSAP). In Flutter, take its **design direction**, and ignore web-only techniques.
- **Dials** (its variance, motion and density settings): field app → variance **low**, motion **low**, density **low to medium** (big touch targets, predictable layouts, low-end phones). Dashboard → variance **low**, motion **low**, density **medium to high** (officers scan tables and charts).
- **Deliverable before any feature screen (M2.2):** `docs/design/DESIGN.md` with colour roles (light and dark), type scale **for Latin, Sinhala and Tamil**, spacing, radii, elevation, motion durations, component rules, and empty/error/loading/offline patterns. The owner approves it before M2.8 (client form).
- **Shared widgets** live in `packages/grs_ui` so mobile and dashboard stay consistent.

**The skills may never override**

1. Section 3 invariants and the section 7 field tables.
2. **Form fidelity:** the client form keeps the order and wording of the paper and format forms. Style them, do not redesign them.
3. Accessibility floor: touch targets ≥ 48 dp, readable contrast, usable at **200 % font scale**, no clipped Sinhala/Tamil (taller line heights), TalkBack labels on key flows.
4. Performance on 2–3 GB Android phones: no heavy animation, no large unoptimised assets.
5. Clear **sync state** and **offline state** on every screen that shows records.

**Review rule:** every screen PR carries screenshots at 360 dp width, 100 % and 200 % font scale, in Sinhala, Tamil and English. Golden tests cover the form, the status badges and the credential screen.

---
---

## 5. Data model (authoritative; refines blueprint §8)

All tables: `id`, `created_at`, `updated_at`, `created_by`, `updated_by`. Row Level Security is **enabled on every table**. The `anon` role has **no policies** (it reads nothing). The `authenticated` role gets only the scoped policies in section 5.5, and only if direct access is enabled (C11). The API uses the server connection (which bypasses RLS) but still enforces scope in code. A test calls the Supabase REST endpoint with the public anon key and must get **no data**.

### 5.1 Enums

`user_role`, `gender` (`F, M`), `info_provided_by` (`self, mother, father, sister, other`), `sync_status` (device side only: `draft, pending, synced, failed, rejected`), `duplicate_status` (`open, confirmed, dismissed`), `job_status` (`queued, running, done, failed, expired`).

### 5.2 Tables

| Table | Columns (additions to the blueprint are **new**) |
| --- | --- |
| `profiles` | `id`, **`user_code`** (`GRS` + 10 digits, unique), `email` (**verified only**, unique on `lower(email)`), **`pending_email`**, `password_hash` (Argon2id), `must_change_password`, **`password_expires_at`** (only while `must_change_password`), `password_changed_at`, `role` enum, `full_name`, `phone_e164`, `preferred_language` (`si/ta/en`), `created_by`, `district_id`, `ds_id`, `gn_id`, `team_id`, `is_active`, `deactivated_at`, `deactivated_by`, `failed_login_count`, `locked_until`, `last_login_at`, **`token_version`** (bumped on deactivation and password reset to kill all tokens) |
| `refresh_tokens` **new** | `profile_id`, `token_hash`, `device_id`, `expires_at`, `revoked_at`, `replaced_by` (rotation with reuse detection) |
| `email_codes` **new** | `profile_id`, `email`, `purpose` (`verify`, `reset`), `code_hash`, `expires_at`, `attempts` |
| `account_batches` **new** | `created_by`, `role`, `team_id`, `count`. **No passwords, ever.** |
| `account_audit` **new** | `actor_id`, `target_id`, `action` (`created, password_reset, reissued, deactivated, reactivated, email_added, password_changed`), `batch_id`, `at` |
| `rate_limits` **new** | `key`, `window_start`, `count` (login and email endpoints only; see 8.5), cleaned by `pg_cron` |
| `app_settings` **new** | key/value: `consent_version`, `agent_can_edit_synced`, `admin_edit_levels`, `web_entry_roles`, `sync_jitter_max_s`, `sync_batch_max`, `min_supported_version` |
| `districts` | `name_si`, `name_ta`, `name_en` |
| `divisional_secretariats` | `district_id`, `name_*`, **new** `sdo_name` (paper form 002 item 3, nullable) |
| `gn_divisions` | `ds_id`, `gn_number`, `gn_name`, `cdc_secretary_id` (nullable), **new** `secretary_name`, `secretary_contact`, `secretary_email`, `next_serial` (default 1) |
| `teams` | `gn_id`, `team_no`, `leader_id` (unique, nullable), `max_members`, **new** `stats_dirty_at`; unique `(gn_id, team_no)` |
| `households` | per blueprint, plus **new** `district_id`, `ds_id` (denormalized), `house_no_norm`, `serial_no` (never reused), `age_group_min`, `age_group_max`, `version`, `deleted_at`, `deleted_reason`, `import_batch_id` |
| `clients` | per blueprint with split phone fields (`phone_raw`, `phone_e164`, `whatsapp_raw`, `whatsapp_e164`); **new** denormalized `district_id, ds_id, gn_id, team_id` (copied from the household on write, so scope filters never need a join), `name_norm`, `info_provided_by_other`, `consent_given`, `consent_at`, `consent_version`, `server_version`, `content_hash`, `received_at`, `deleted_at`, `duplicate_of`, `app_version`, `schema_version` |
| `client_audit` **new** | `client_id`, `changed_by`, `changed_at`, `before` jsonb, `after` jsonb, `reason` |
| `duplicate_candidates` **new** | `client_a`, `client_b`, `score`, `reasons` jsonb, `status`, `reviewed_by`, `reviewed_at`; unique on the ordered pair |
| `team_stats`, `area_stats` **new** | Pre-calculated counters (houses assigned/started/done, clients, EPF/ETF/Aswesuma/Samurdhi/special needs) per team, and rolled up per GN, DS, district, national. Carry `refreshed_at`. See 8.5. |
| `lookup_values` | `category` (`education, vocational_qualification, vocational_stream, job, future_hope, info_provided_by`), `code`, `label_si/ta/en`, `sort`, `is_active` |
| `import_batches` | per blueprint, plus `status` (`previewed, committed, expired`), `error_report_path` |
| `import_staging` **new** | `batch_id`, `row_no`, `data` jsonb, `errors` jsonb |
| `export_jobs` **new** | `requested_by`, `kind`, `filters` jsonb, `status`, `file_path`, `expires_at`, `error` |
| `app_releases`, `sync_log` | per blueprint |

### 5.3 Constraints and indexes (must exist in migrations)

- `profiles`: unique `user_code` with check `^GRS[0-9]{10}$`; unique `lower(email)`; indexes on `created_by`, `team_id`. IDs are generated randomly with **insert-and-retry on unique violation** (never check-then-insert).
- `households`: unique `(gn_id, house_no_norm)` **where** `deleted_at IS NULL`; unique `(gn_id, serial_no)`; index `(team_id)`. One team per house is structural (`team_id` is one column). Assignment uses a conditional update (8.4).
- `clients`: **keyset indexes** `(district_id, created_at, id)`, `(ds_id, created_at, id)`, `(gn_id, created_at, id)`, `(team_id, created_at, id)`, `(collected_by, created_at, id)`; `(household_id)`, `(phone_e164)`, `(whatsapp_e164)`; `pg_trgm` GIN on `name_norm`. Checks: `age BETWEEN 1 AND 120`, `gender IN ('F','M')`.
- `teams`: unique `leader_id`; function `team_active_member_count(team_id)`.
- Extensions: `pgcrypto`, `pg_trgm`, and `pg_cron` if spike S7 confirms it on the free tier.
- **Partitioning is not done in v1** (blueprint: only at tens of millions of rows). **Prepare for it:** keep area ids denormalized on `clients`, never rely on a join for scope, and check "does this id exist anywhere" before any upsert. If `clients` is later partitioned by district, the primary key must include the partition column. Rehearse this in M9.8 and record the plan in `DECISIONS.md`.

### 5.4 Area scope (one function, used by the API and by RLS)

`app.can_see(row)` returns true when any of these holds. Scope is decided from the profile in the database, **never from claims in a token**.

| Role | Sees |
| --- | --- |
| super_admin | everything |
| admin (L0), cg (L1) | national (C17), plus own entries |
| dc (L2) | rows with their `district_id`, plus own entries |
| sda (L3) | rows with their `ds_id`, plus own entries |
| cdc_secretary (L4) | rows with their `team_id`, plus own entries |
| team_member (L5) | rows with `collected_by` = themselves |

Writes: Level 4 and Level 00 may correct client and house fields in scope (C13). Level 5 writes only through sync, never by editing a synced record (C2).

### 5.5 Direct database access and Row Level Security (owner decision D1, gated by S2)

**If S2 passes**, the apps may read from, and in a few cases write to, Supabase directly with the public anon key plus a **NestJS-issued access token** whose `sub` is the profile id. RLS is then a **primary** security layer. If S2 fails, none of this is exposed to apps and RLS remains the second layer.

| Operation | Path | Why |
| --- | --- | --- |
| Lookups, areas, in-scope house and client lists (keyset paged), progress counts from summary tables | **Direct** (RLS) | Simple, fast, and keeps read load off the API |
| Level 4 / Level 00 corrections of houses and clients | **Direct** (RLS + triggers) | Audit, version bump and locked-column rules run **in the database** |
| Saving clients (sync push) | **API only** | Per-record results, ownership checks, bulk upsert, duplicate scoring |
| Account creation, password reset, deactivation, imports, exports, team assignment, house creation, duplicate review actions | **API only** | Secrets, hashing, multi-row transactions, files |
| "Download my area" on the phone | **API** (`/sync/area`, paged) | Consistent cursor and deletion markers for offline use |

**Rules**

1. Only the listed tables are exposed to Supabase REST. Helper functions live in a private `app` schema that is **not exposed**. Revoke default `EXECUTE` from `public` and `anon`, then grant explicitly.
2. **The role comes from the database.** `app.me()` (`SECURITY DEFINER`, fixed `search_path`) returns the caller's profile by `auth.uid()` only if `is_active` and the token's `token_version` still matches. Every policy starts from it, so a deactivated or reset account reads nothing **at once**, even with an unexpired token.
3. **Policies** (anything not listed is denied): reference data (areas, teams, lookups) readable by any active user; `profiles` own row plus in-scope rows for admin levels; `households` and `clients` readable where `app.can_see`; UPDATE only for Level 4 of that team and Level 00 (and levels listed in `admin_edit_levels`); **no direct INSERT or DELETE** on `clients` or `households`; `client_audit`, `duplicate_candidates`, `team_stats`, `area_stats` readable in scope; `import_*`, `export_jobs`, `app_settings`, `rate_limits`, `refresh_tokens`, `email_codes`, `account_*`, `sync_log` **not accessible directly**.
4. **Other teams' houses (C4):** only through `SECURITY DEFINER` function `rpc_house_availability(gn_id)` that checks `app.me()` and returns house no., serial and "taken by Team N". Never a view that widens `households`.
5. **Triggers:** set `updated_at`, `updated_by`; bump `version`/`server_version`; reject changes to immutable columns (`id`, `collected_by`, `household_id`, scope ids, `serial_no`, `created_*`); write `client_audit` on every client update.
6. Aggregates use `SECURITY INVOKER` functions or `security_invoker` views. **Never `SECURITY DEFINER` views.**
7. Set a PostgREST max-rows limit. Realtime stays off. Direct list queries must use keyset pagination and the indexes in 5.3.
8. **Tests (M1.12):** every table × role (anon, deactivated, Level 5 team A, Level 5 team B, Level 4 team A, Level 4 team B, Level 00) × operation: assert allowed or denied and the row count. Plus an **API-vs-RLS agreement test** and `EXPLAIN` on the main list queries with 5 M synthetic clients to prove the policies use indexes.

---
---

## 6. API contract (prefix `/v1`; OpenAPI committed as `apps/api/openapi.json`)

Error body is always `{ "code": "STRING_CODE", "message_key": "i18n.key", "details": {} }`. Apps translate by `message_key`. Never return stack traces. Every authenticated endpoint verifies the access token and then loads the profile on **every request** (active, `token_version`), so deactivation and resets apply immediately. Busy or throttled responses are `429`/`503` with `Retry-After`. Lists are keyset-paged with an opaque `cursor`.

### 6.1 Who creates whom (blueprint §3.2, stored as data; C15)

| Level | Can create accounts for |
| --- | --- |
| 00 | Level 0 and Level 1 admins, and any other level |
| 0 | to be decided (not built) |
| 1 | Level 2 admins, and their own team members (M13) |
| 2 | Level 3 admins, and their own team members (M13) |
| 3 | Level 4 team leaders, and their own team members (M13) |
| 4 | Level 5 team members of their own team |
| 5 | no one |

In v1: **Level 00 creates Level 4 and Level 5 accounts; Level 4 creates Level 5 accounts for their team.** The team's member limit applies to every creation (C8).

### 6.2 Endpoints

| Area | Endpoint | Who | Notes |
| --- | --- | --- | --- |
| Auth | `POST /auth/login` | public | Body `{identifier, password, device_id}`. `identifier` is a `GRS…` ID (case-insensitive) or a verified email. Rate-limited per ID, email and device. Uniform failure response. If `must_change_password` or the initial password has expired, the result says so and the token is **scope-limited to `change-password`**. |
| | `POST /auth/change-password` | any signed-in | Current + new password. Clears `must_change_password`, bumps `token_version`, returns a full session. |
| | `POST /auth/refresh`, `/auth/logout` | any | Access token 15 min, refresh token 30 days, rotation with reuse detection. |
| | `POST /auth/email/add`, `/auth/email/verify` | any signed-in | Stores `pending_email`, emails a 6-digit code (15 min, 5 attempts, resend cooldown). On success moves it to `email`. One email per account. |
| | `POST /auth/forgot`, `/auth/reset` | public | Always answers `202` (no hint whether the email exists). Works only for **verified** emails. Accounts without email: ask the admin (reset below). |
| Accounts | `POST /accounts` | per 6.1 | One account. Returns the generated ID and password **once**. |
| | `POST /accounts/bulk` | per 6.1 | `{role, team_id, rows[]}` or `{count}`; **up to 100 per request** (the client chunks larger jobs). Atomic against the team limit. Returns IDs and passwords **once** in the response only. The dashboard or app builds the credential sheet from that response locally. **Nothing is stored server-side.** |
| | `GET /accounts` | per scope | Keyset-paged. Never returns hashes. |
| | `PATCH /accounts/:id`, `POST /accounts/:id/deactivate`, `/reactivate` | per 6.1 | Deactivation bumps `token_version`. |
| | `POST /accounts/:id/reset-password` | creator or L00 (C18) | New random password, shown once, forces change, bumps `token_version`. |
| | `POST /accounts/batches/:id/reissue` | creator or L00 | If a creation response was lost: new passwords for batch members who have **never signed in**. |
| Config | `GET /config` | any | `min_supported_version`, `agent_can_edit_synced`, `consent_version`, lookup version, **sync pacing** (`sync_jitter_max_s`, `sync_batch_max`). Old apps get **HTTP 426** from every endpoint. |
| Lookups | `GET /lookups?since=` | authenticated | Versioned, cacheable. |
| Areas/teams | CRUD `/districts /ds /gn /teams` | L00 | Team `max_members` set here. |
| Houses | `GET /houses`, `POST /houses`, `PATCH /houses/:id`, `DELETE /houses/:id` (soft) | L4 own GN, L00 | Serial allocated server-side. |
| | `POST /teams/:id/houses` | L4 own team, L00 | Body `{house_ids[]}`. All-or-nothing; 409 lists houses already taken. |
| | `DELETE /teams/:id/houses/:houseId` | L4, L00 | Only if no clients, else reassign. |
| Import | `POST /imports/preview` (multipart, <4.5 MB), `POST /imports/:id/confirm`, `GET /imports/template?lang=` | L4 own GN, L00 | Preview stores rows in `import_staging`; confirm commits valid rows only, re-validating at commit time. |
| Sync | `GET /sync/area?cursor=` | data-entry roles | Paged (≤500 rows/page). Houses, own-scope clients, lookups, profile, deletion markers. |
| | `GET /sync/changes?since=` | same | Delta incl. house edits and deletions made after the first download. **Called on open, after a push, and on Sync now. Never on a timer.** |
| | `POST /sync/push` | same | Section 8.3. |
| Clients | `GET /clients` (filters, keyset), `PATCH /clients/:id` | in scope / L4 own team, L00 | Corrections write `client_audit`. |
| | `POST /clients` | roles in `web_entry_roles` | Online entry from the dashboard; same validation and write path as sync. |
| Duplicates | `GET /duplicates`, `POST /duplicates/:id/confirm|dismiss` | L4 own team, L00 | Section 9. |
| Stats | `GET /stats/progress` | by scope | Read from `team_stats`/`area_stats`. Includes `refreshed_at`. |
| Exports | `POST /exports`, `GET /exports/:id` | by scope (Level 5: none) | Creates an `export_jobs` row. The file is written to a **private Storage bucket**; the response gives a short-lived signed URL. Never streams a large file through the API. Files expire after 24 h. |
| Releases | `GET /releases/latest` | public | Version, checksum, APK page URL. |

Every endpoint has a row in the **role × endpoint authorization test matrix** (12.3). An endpoint without a matrix row cannot be merged.

---
---

## 7. Field traceability (nothing in a source form may be missing, nothing may be invented)

### 7.1 Household, pre-visit data (Format Level 4 items 1–9 · paper DD/S/002)

| Source | Field | Storage | Rule |
| --- | --- | --- | --- |
| F-L4 1, P2-1 | District | via GN → DS → district | derived, never typed per house |
| F-L4 2, P2-2 | Divisional Secretariat | via GN → DS | derived |
| P2-3 | Praja Shakthi / SDO officer name | `divisional_secretariats.sdo_name` | nullable; L00 sets it |
| F-L4 3-4, P2-4 | GN division no. and name | `gn_divisions.gn_number`, `gn_name` | set once per GN |
| F-L4 5-7 | CDC Secretary name, contact, email | `gn_divisions.secretary_name/contact/email` | set once per GN |
| F-L4 8.1 | Serial no. (auto) | `households.serial_no` | server-allocated, never reused |
| F-L4 8.2, P2-5 | House no. | `house_no`, `house_no_norm` | unique per GN |
| F-L4 8.3, P2-5 | House leader name | `house_leader_name` | as on election list |
| F-L4 8.4 | Address | `address` | optional |
| F-L4 8.5 | Village name | `village_name` | optional |
| F-L4 8.6, P2-9 | EPF / ETF / Aswesuma / Samurdhi / special needs | `is_epf`, `is_etf`, `is_aswesuma`, `is_samurdhi`, `has_special_needs` | yes/no. **Samurdhi appears only in the format file; keep it (format wins).** |
| F-L4 9, P2-6 | Target beneficiaries female / male | `target_female`, `target_male` | integer 0–99 |
| F-L4 9, P2-7 | Age group (e.g. 18-25) | `age_group_min`, `age_group_max` | parsed from `18-25` |
| F-L4 9, P2-8 | Language Sinhala / Tamil / English | `lang_sinhala`, `lang_tamil`, `lang_english` | yes/no each |
| F-L4 team table | Team no. ↔ house nos. | `teams.team_no`, `households.team_id` | one team per house |

### 7.2 Client, per beneficiary (Format Level 5 items 10.1–10.13 · paper DD/S/001)

| Source | Field | Column | Type / rule |
| --- | --- | --- | --- |
| 10.1, P1-1 | Name | `name` | required, 2–120 chars |
| 10.2, P1-1 | Age | `age` | required, 1–120 |
| P1-1 | Gender (female/male) | `gender` | required `F` or `M` |
| 10.3 | Address | `address` | prefilled from house, editable |
| 10.4 | Phone no. | `phone_raw` → `phone_e164` | optional, normalized |
| 10.5, P1-1 | WhatsApp no. | `whatsapp_raw` → `whatsapp_e164` | optional, normalized |
| 10.6, P1-2 | Highest education | `highest_education` | lookup code |
| 10.7, P1-3 | Highest vocational qualification | `highest_vocational` | lookup code |
| 10.8, P1-4 | Interested vocational stream | `interested_vocational_stream` | lookup code |
| 10.9, P1-5 | Interested job | `interested_job` | lookup code |
| 10.10, P1-6 | EPF / ETF / Aswesuma / Samurdhi | four booleans | yes/no each |
| 10.11, P1-7 | Special needs | `has_special_needs` | required yes/no |
| 10.12, P1-8 | Future hopes (multi) | `future_hopes text[]` | codes: `higher_education, vocational_education, entrepreneur, local_job, foreign_job` |
| 10.13 | Information provided by | `info_provided_by` (+ `info_provided_by_other`) | required; `other` allows text |
| (new) | Consent | `consent_given`, `consent_at`, `consent_version` | required `true` to save |

House-level fields (8–9) are **auto-filled** on the client screen and read-only. Agents fill only 10.1–10.13.

**Coverage test (M1.9):** a script parses `docs/traceability.csv` (this section as CSV) and fails CI if any listed field has no column, DTO property, Dart model field, form widget and Excel/export column.

---

## 8. Sync protocol (the most important part)

### 8.1 Local database (Drift + SQLCipher)

Tables: `households` (server copy), `clients` (with `sync_status`, `local_revision` int, `base_version`, `retry_count`, `last_error_code`, `client_updated_at`), `lookups`, `meta` (cursors, last sync, `sync_lock`, cached pacing config), `profile`. Key in Android Keystore via secure storage. **Drafts never leave the phone.** Only `pending` records are pushed.

### 8.2 Rules that prevent the classic bugs

1. **Atomic save.** The form saves in one Drift transaction. A crash never leaves half a record.
2. **Revision guard.** The sync worker sends `local_revision = N`. After the server confirms, mark `synced` **only if the local row is still at revision N**. If the agent edited it meanwhile, it stays `pending`.
3. **Single-flight.** Foreground sync and the workmanager isolate must not run together. Use a `sync_lock` row with an expiry timestamp.
4. **Per-record results.** The response lists every record with `ok | stale | rejected | forbidden | locked`. A batch is never all-or-nothing.
5. **Transient vs permanent.** Network, `5xx`, `429`, timeouts → `failed`, retry with backoff. Validation or forbidden → `rejected`, **no automatic retry**, shown red with the reason and a Fix button.
6. **Session.** If the session cannot refresh (expired and offline), keep recording; sync resumes after the refresh or sign-in. Background workers refresh through the same lock. A `change-password`-scoped session never syncs.
7. **User switch.** A different user on the same phone must never see the previous user's data. Block sign-in if anything is unsynced; otherwise wipe the local DB and key.
8. **Logout guard.** Warn with the count of unsynced records; local data stays encrypted if the agent logs out anyway.
9. **Retention.** Keep synced copies ≥30 days. Never auto-delete `pending`, `failed` or `rejected`.
10. **Version gate.** HTTP 426 shows a blocking "Update required" screen. Local data stays intact.
11. **Deactivation.** A `401` caused by deactivation stops syncing, keeps local data encrypted, and shows "Contact your admin". It never wipes data automatically.

### 8.3 `POST /sync/push`

Request: `{ device_id, app_version, schema_version, records: [ {type:"client", id, base_version, client_updated_at, data{...}} ] }` (≤ `sync_batch_max`, default 50; ≤1 MB).

Server, **for the whole batch**:

1. Validate every record in code with the shared rules (Appendix A vectors). Invalid ones become `rejected` results and are removed from the batch.
2. One query loads existing rows: `SELECT id, collected_by, household_id, server_version, content_hash FROM clients WHERE id = ANY($ids)`.
3. Decide per record in code:
   - the household must be in the caller's scope (Level 5 and Level 4: own team's houses) and not soft-deleted, else `forbidden`;
   - if the id exists with another `collected_by` → `forbidden` (never overwrite someone else's record);
   - if it exists with the **same** `content_hash` → `ok` (a retry after a lost response);
   - if it exists with different content and the caller is Level 5 and `base_version ≥ 1` → `locked` (C2). With `base_version = 0` the app never saw a confirmation, so it is accepted as a retry or edit of a still-pending record **and audited**.
4. **One bulk statement** saves all remaining records, for example `INSERT … SELECT … FROM jsonb_to_recordset($json) … ON CONFLICT (id) DO UPDATE … WHERE clients.collected_by = EXCLUDED.collected_by RETURNING id, server_version`. A record missing from `RETURNING` lost a race and is reported `forbidden`. Never loop one query per record.
5. Mark `teams.stats_dirty_at = now()` for each affected team in the same transaction (cheap and idempotent; see 8.5).
6. Run duplicate scoring **after commit** (section 9) so it cannot fail a save.
7. Return `{id, status, server_version, code?}` per record.

### 8.4 Race-safe team assignment

```sql
UPDATE households SET team_id = :team, version = version + 1
WHERE id = ANY(:ids) AND gn_id = :gn AND team_id IS NULL AND deleted_at IS NULL;
-- if rowcount <> array_length(:ids) → ROLLBACK, return 409 with the ids that were taken
```

When a Level 00 reassigns a house that already has clients, update those clients' denormalized `team_id` in the **same transaction**. Team member limits use `SELECT … FOR UPDATE` on the team row.

### 8.5 Scaling rules (blueprint §6.1, built from day one)

| Area | Rule |
| --- | --- |
| **Phones: when to sync** | Sync **only when records are waiting**, never on a fixed timer. Triggers: connectivity regained, app open, a record saved while online, **Sync now**. Background work is a one-off task scheduled **only while pending > 0** and cancelled when it reaches 0. |
| **Phones: spread the load** | Background syncs wait a **random delay** `0…sync_jitter_max_s` (server-tunable via `/config`, default 120 s). Manual **Sync now** has no delay. |
| **Phones: batch** | A record saved online joins the **next small batch a few seconds later** instead of making its own request. Batches up to `sync_batch_max` (default 50). |
| **Phones: back off** | On `429`/`503` honour `Retry-After`, then use exponential backoff with **full jitter**, capped (e.g. 15 min). Never retry in a tight loop. |
| **Server: shed load** | Return `429`/`503` + `Retry-After` when a per-device limit trips, the pooler cannot hand out a connection in time, or a statement times out. Raise `sync_jitter_max_s` centrally if the load is high. |
| **Database** | Connect through the pooler. One bulk upsert per batch. Keyset pagination only. Area ids denormalized and indexed (5.3). Narrow rows, long text out of hot tables. Compute size is a **configuration choice** decided from load tests (M9.2, M9.6). |
| **Dashboards** | Totals and progress come from `team_stats` and `area_stats`. Pushes only mark a team **dirty**. A `pg_cron` job (spike S7; every few minutes) **recomputes the dirty teams from source** and rolls totals up to GN, DS, district and national. This is exact and idempotent: retried pushes, edits and soft deletes can never cause counter drift. Dashboards show `refreshed_at`. A nightly job compares summary numbers with fresh source counts and reports any drift. |
| **Exports and reports** | Run as `export_jobs`. Small jobs run inline within the function limit under a row cap. Large jobs run on a separate runner (spike S7). Output goes to Storage with a download link. |
| **Accounts at scale** | Bulk creation (≤100 per request) with a credential sheet built on the client. Unique indexes on `user_code` and `lower(email)`. Hashing for generated one-time passwords may use lighter Argon2 settings than user-chosen passwords (benchmark in S2, record in `DECISIONS.md`). Email volume is sized with the provider (B4). |
| **Prove it** | Parameterised load test of the 10:00–15:00 window (12.6), before the pilot ends and before each large district is added. Roll out district by district, watching database load and error rates. |

---
---

## 9. "Extremely smart" duplicate detection

**Principle: flag, never block and never delete.** A wrong automatic merge of citizen records is worse than a missed duplicate.

**Layers**

| Layer | Where | What |
| --- | --- | --- |
| 0. Identity | server | UUID upsert (hard idempotency, section 8). |
| 1. Houses | server + import | Unique `(gn_id, house_no_norm)`. Normalization: trim, uppercase, remove inner spaces, `\` → `/`, strip leading zeros of numeric parts (`025`≡`25`, `25 a`≡`25/A`). |
| 2. On-device warning | app | While typing, compare against the agent's local clients in the **same house**: name similarity or same phone → "This person looks already entered. Continue or open it?" Never blocks. |
| 3. Server scoring | server, after sync | Compare the new client against candidates found by index: same `phone_e164`/`whatsapp_e164` (either field vs either), same GN with `name_norm` trigram similarity, same household. |
| 4. Review queue | dashboard | L4 (own team) and L00 see candidates with reasons. Actions: **Confirm duplicate** (sets `duplicate_of`, excluded from counts, nothing deleted) or **Dismiss**. |

**`name_norm`:** NFC, lowercase, strip honorifics (e.g. Mr, Mrs, Miss, Ms, Rev, Dr), remove punctuation and ZWJ/ZWNJ, collapse spaces, sort name tokens (so token order differences match). Sinhala/Tamil ↔ Latin transliteration is **out of scope**; compare within the same script only. Do not claim otherwise.

**Score (starting weights, tune on the labelled set):** same phone/WhatsApp +50; name similarity ≥0.85 +30 (≥0.70 +15); same household +15; same GN +5; age within ±1 +5; different gender −40. Thresholds: ≥70 `probable`, 45–69 `possible`, <45 ignore. Reasons are stored as JSON so reviewers see *why*.

**Anti-false-positive rules:** siblings share a phone and household but differ in name and age (the score must stay < `probable`); a family sharing one phone must never be auto-flagged on phone alone (phone alone = +50 only, below 70).

**Acceptance:** `docs/test-vectors/duplicates.json` holds ≥60 labelled pairs (true duplicates with typos, spacing, token order, +94/0 phone forms; look-alike non-duplicates such as siblings, parent/child, same name in different GN). Report precision and recall in the PR. **Targets: precision ≥ 0.95 for `probable`, recall ≥ 0.90 for true duplicates across `probable + possible`.** Scoring a new record against 100k existing rows must finish in < 300 ms using indexes (EXPLAIN attached).

---

## 10. Reports and exports (v1 default set until B6 sign-off)

| Id | Report | Format | Who |
| --- | --- | --- | --- |
| R1 | Progress by district / DS / GN / team (houses done vs assigned, clients collected) | dashboard + Excel | by scope |
| R2 | Client list (all fields, chosen language labels) | Excel / CSV | by scope: Level 00 and admin Levels 0–4 for their own area and below; Level 5 none |
| R3 | Beneficiary summary (EPF, ETF, Aswesuma, Samurdhi, special needs counts) | dashboard + Excel | by scope |
| R4 | Interests summary (vocational stream, job, future hopes counts) | dashboard + Excel | by scope |
| R5 | Duplicate review list | Excel | L4, L00 |

**PDF gate (spike S3):** most Node PDF libraries shape Sinhala/Tamil conjuncts badly. Render a test PDF containing `ශ්‍රී ලංකා`, `ක්‍ෂ`, `தமிழ்`, `ஸ்ரீ`, rasterize it and **look at it**. If it fails: produce PDF through the browser's print engine from the Flutter Web dashboard (a print-styled report page), and keep Excel as the primary format. Do not ship a PDF with broken glyphs.

---

## 11. Work plan

Task ids are stable. "Blueprint" maps to its phases (0–10). Dependencies are listed; tasks without dependencies in the same milestone can run in parallel by separate agents (11.14). **Launch scope = Level 00, Level 4, Level 5** (M0–M11). M13 (Levels 1–3) comes after launch.

### M0 — Foundation and spikes (Blueprint phase 0, 1 week)

| ID | Task | Done when |
| --- | --- | --- |
| M0.1 | Create the monorepo (4.1), CI skeleton (lint, test, build), `.env.example`, docs files | CI green on an empty PR |
| M0.2 | Copy this plan, blueprint v1.3, format PDF and form photos into `docs/sources/` | Files committed |
| M0.3 | **S1** Vercel + NestJS + Prisma via Supabase pooler, region near Singapore, 4.5 MB request test, cold-start timing | `/health` returns a DB round-trip; numbers in `DECISIONS.md` |
| M0.4 | **S2** Auth and tokens. (a) Argon2 on Vercel: choose a library that builds there (e.g. try the native `argon2` package, then a prebuilt-binary alternative) and benchmark **two parameter sets**: full strength for user-chosen passwords (login < 500 ms) and lighter for generated one-time passwords (bulk of 100 within the function limit). (b) **Can a NestJS-issued token be accepted by Supabase for RLS?** Use the method the current Supabase docs describe for custom or imported JWT signing keys. | (a) Library and parameters recorded. (b) A token for an active profile reads in-scope rows through Supabase REST with the anon key; a deactivated profile or old `token_version` reads **zero rows**; a wrongly signed token is refused. **Go/no-go for direct access (C11) recorded.** |
| M0.5 | **S3** Sinhala/Tamil PDF shaping test (section 10), used for reports **and credential sheets** | Screenshot in `DECISIONS.md` with go/no-go |
| M0.6 | **S4** Flutter + Drift + SQLCipher + workmanager: encrypted DB opens in a background isolate with a key from secure storage | Test app writes in foreground, reads in the background task |
| M0.7 | **S5** Flutter Web renders Sinhala and Tamil with bundled Noto fonts; 3 MB xlsx upload works | Screenshot and upload log |
| M0.8 | **S6** Email: chosen free-tier provider delivers the verification code to a Gmail inbox (not spam) from the chosen domain (B4) | Delivered screenshot |
| M0.9 | **S7** Scheduled and long jobs on free tiers: is `pg_cron` available on the free Supabase project, and what runs the **large export** jobs (e.g. an on-demand GitHub Actions run that writes to Storage; check current limits and data-handling rules)? | A cron job refreshes a test summary table every 5 min; a large export runs end to end; choices recorded |
| M0.10 | **Install agent skills** (4.2) and write `docs/agent-skills.md` | Skills committed under `.agents/skills/`; sources, versions or commits listed |
| M0.11 | Record the owner's answers (D1, D11, C1, C2, C4, C6 confirmed) and the accepted defaults for the rest | `DECISIONS.md` has an entry for each |

### M1 — Backend foundation (Blueprint phase 1, 2–3 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M1.1 | Prisma schema and migrations per section 5, extensions, constraints, indexes, **RLS enabled on every table (anon reads nothing)** | M0.3 | Migration runs on a clean DB; anon-key REST test returns nothing |
| M1.2 | Role enum, `role_rank()`, `ScopeContext`, `ScopedRepository`, lint rule forbidding direct `PrismaService` in controllers, `app.can_see` | M1.1 | Unit tests per role |
| M1.3 | Auth core: login by ID or email, uniform failures, Argon2, access + refresh tokens with rotation and reuse detection, lockout, per-request profile check (`is_active`, `token_version`) | M1.2, M0.4 | Deactivated user's next request gets 401 **and** (if direct access is on) zero rows directly |
| M1.4 | **Accounts:** ID generator (`GRS` + 10 random digits, insert-and-retry), password generator (Appendix G), single and bulk creation (≤100), creation matrix as data (6.1), `account_batches`, `account_audit`, **first sign-in** (scope-limited token, forced change), unused-password expiry, reissue and reset | M1.3, B11 | 1,000 concurrent creations give 1,000 unique IDs; passwords appear only in the one response; log/DB scan finds none |
| M1.5 | Team member limit: atomic check at creation (C8), single and bulk | M1.4 | 20 concurrent bulk requests of 5 into a limit-10 team create exactly 10 members, rejected requests are whole |
| M1.6 | Lookups table, seed from `docs/lookups.md` (B1), `/lookups` | M1.1, B1 | Three labels per code, version endpoint |
| M1.7 | Areas/teams CRUD for L00, 25 districts seeded (Appendix E); DS/GN via CSV import helper | M1.2 | Pilot area loads from CSV |
| M1.8 | `/config` (incl. sync pacing), version gate (426), `app_releases`, DB-backed rate limits for auth endpoints, `429/503 + Retry-After` handling | M1.3 | Old version rejected everywhere; throttled login returns `Retry-After` |
| M1.9 | Traceability CSV and coverage test; shared validators with `docs/test-vectors` | M1.1 | CI fails when a field is missing in any layer |
| M1.10 | Role × endpoint authorization matrix generator and tests | M1.2 | Every endpoint has a row; zero cross-area leaks |
| M1.11 | Sentry with PII scrubbing; structured logs without PII or credentials | M1.3 | Log sample reviewed |
| M1.12 | **RLS policies, helper functions, `rpc_house_availability`, full policy test harness** (5.5). Skip the direct-access parts if S2 is no-go, but keep the deny-all tests | M1.1, M1.2, M0.4 | Role × table × operation matrix green; API-vs-RLS agreement test green; EXPLAIN attached |
| M1.13 | Database triggers: timestamps, version bump, immutable columns, `client_audit` | M1.1 | Direct update by Level 4 writes an audit row; changing `collected_by` is rejected |
| M1.14 | **Summary tables and refresh job:** `team_stats`, `area_stats`, dirty marking, `pg_cron` refresh and roll-up, nightly drift check | M1.1, M0.9 | After 10k synthetic pushes the summary equals fresh SQL counts exactly; drift check reports zero |
| M1.15 | Email service (verify and reset codes) with the chosen provider | M0.8, B4 | Codes sent, 15 min expiry, 5 attempts, cooldown |

### M2 — Mobile core, data entry (Blueprint phase 2, 3 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M2.1 | `grs_core` package: models, validators (against shared vectors), API client, error mapping, `dd_campaign` feature module | M1.9 | Dart vectors = API vectors, 100 % pass |
| M2.2 | App shell and **design system** (4.2): `docs/design/DESIGN.md`, `grs_ui` tokens and widgets, Riverpod, go_router, Noto Sinhala/Tamil fonts | M2.1, M0.10 | Owner approves DESIGN.md; widget tests; no clipped text at 200 % in all three scripts |
| M2.3 | l10n: ARB for si/ta/en, language picker on login and settings, saved to profile | M2.2 | Every string has all three keys (CI check) |
| M2.4 | Secure storage, Drift + SQLCipher DB, migrations tested | M0.6 | Opening with a wrong key fails safely |
| M2.5 | **First sign-in flow:** login by ID or email, forced new password, optional **add email + code**, forgot-password (email) or "ask your admin" when no verified email | M1.4, M1.15 | Works against staging; wrong ID and wrong password look identical |
| M2.6 | Session handling (refresh, offline cold start with expired access token), deactivation screen, version gate screen | M1.3 | Airplane-mode cold start opens the app |
| M2.7 | "Download my area" (paged, resumable), home screen, house list with search and status filter | M1.1 | 2,000 houses scroll smoothly on a 2 GB RAM phone |
| M2.8 | House detail and **client form** (all 10.1–10.13, section 7.2): "Save and add next beneficiary", "Save and finish house", drafts, edit/delete drafts and pending | M2.4, M2.7 | Field-by-field test against traceability CSV; golden tests |
| M2.9 | Consent screen before the form; stores version and time | B2 | Cannot save without consent |
| M2.10 | Sync status badges and **My records** (everything I entered, with status; edit only while pending) | M2.8 | Golden tests |

*Frontend generation instruction (owner): follow `Leonxlnx/taste-skill` for UI/UX direction (visual polish, high contrast, typography hierarchy, micro-interactions) and `flutter/agent-plugins` for implementation (widget tree composition, design system tokens, responsive layout, Riverpod wiring, widget testing and previews). Section 4.2 sets the limits.*

### M3 — Sync engine (Blueprint phase 3, 2 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M3.1 | `POST /sync/push` with the **bulk upsert** (8.3), `/sync/area`, `/sync/changes` | M1.10, M1.13 | Contract tests incl. partial success; 50-record batch uses ≤ 3 queries |
| M3.2 | Client sync service: batching, per-record handling, revision guard, single-flight lock | M3.1, M2.8 | Property test: random crashes and network drops never lose or duplicate a record |
| M3.3 | **Pacing:** one-off background task only while pending > 0, random delay from `/config`, short debounce batching after save, `429/503` + `Retry-After` backoff with full jitter, no periodic timer | M3.2, M1.8 | Storm test (12.4 #14): 5,000 simulated phones spread out; peak 10 s window ≤ 3× the mean |
| M3.4 | User-switch wipe, logout guard, deactivation behaviour, session refresh in background | M3.2 | Tests for each rule in 8.2 |
| M3.5 | Rejected-record "Fix" flow | M3.2 | Fix and resend works |
| M3.6 | Offline test suite (12.4) | M3.3 | All scenarios green |

### M4 — Level 4 features (Blueprint phase 4, 2 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M4.1 | House CRUD API with serial allocation, soft delete rules (C6) | M1.10 | 50 concurrent creates give 50 unique serials |
| M4.2 | Team house selection endpoint (8.4) and unassign rules | M4.1 | Two leaders claiming the same house: exactly one wins; the other gets 409 + list |
| M4.3 | **Level 4 creates team members** (single and bulk) with the one-time credential screen and share action; credentials are not kept after the screen closes | M1.5 | Over-limit request refused; leaving the screen removes the passwords from memory and state |
| M4.4 | Mobile Level 4 screens (online-only writes): GN setup, typed house entry, choose houses, create members, team progress, **team records** view; Level 4 also uses the client form (M2.8) | M4.1–M4.3 | Offline shows a clear "needs internet" state, never a crash |
| M4.5 | Phones receive house edits/deletions made by Level 4 (changes feed) | M3.1 | A house deleted by L4 disappears on the next sync; its clients are kept and flagged |

### M5 — Web dashboard (Blueprint phase 5, 3 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M5.1 | Dashboard shell, login by ID or email, language switch, role-based navigation, first sign-in flow | M2.1, M2.5 | Routes guarded |
| M5.2 | **User management:** create accounts (single and bulk, ≤100 per request, chunked above), **credential sheet built in the browser** (Excel/CSV, printable PDF per S3), deactivate, reactivate, reset password, reissue for a batch, team member limits | M1.4, M1.5 | Sheet contains each password once; nothing is stored server-side; sheet cells are injection-safe |
| M5.3 | Areas/teams management and CSV area import | M1.7 | Pilot area created |
| M5.4 | Excel template download and **import preview/confirm**: row errors, valid-rows-only commit, error report | M4.1, B7 | Fixture files: blank rows, duplicate house no., Sinhala/Tamil text, wrong headers, 4.4 MB and 4.6 MB files |
| M5.5 | Records tables: area-filtered, **keyset paged**, filters (area, language, beneficiary type), corrections with audit (L4/L00); reads and corrections go direct if S2 passed | M1.12, M1.13 | Audit row on every edit; no OFFSET anywhere |
| M5.6 | Progress dashboard from `team_stats`/`area_stats` with `refreshed_at` | M1.14 | Matches SQL counts exactly |
| M5.7 | Sync health (teams with unsynced data) | M3.1 | Optional |
| M5.8 | Admin **data entry** with the same client form, online-only; roles from `web_entry_roles` (off for Level 00 by default, C19) | M2.8, M1.10 | Same validation as the app |

*Frontend generation instruction (owner): follow `Leonxlnx/taste-skill` for dashboard aesthetic direction (clean information hierarchy, modern data density, tasteful data visualization) and `flutter/agent-plugins` for implementation (Flutter Web responsive layouts, custom widgets, state management, preview workflows). Section 4.2 sets the limits.*

### M6 — Duplicate detection (the owner asked for "extremely smart")

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M6.1 | `name_norm`, phone normalization, vectors file with ≥60 labelled pairs | M1.9 | Vectors reviewed by owner |
| M6.2 | Server scoring job after sync, `duplicate_candidates` | M3.1, M6.1 | Precision/recall targets (section 9) met and reported |
| M6.3 | On-device same-house warning | M2.8, M6.1 | Never blocks saving |
| M6.4 | Review queue on dashboard and mobile badge for L4 | M5.5 | Confirm/dismiss with audit; counts exclude confirmed duplicates |
| M6.5 | Performance proof: scoring against 5 M rows, < 300 ms | M6.2 | EXPLAIN attached |

### M7 — Reports and exports (Blueprint phase 6, 1–2 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M7.1 | `export_jobs`: Excel exports R1–R5 to Storage with signed URL, 24 h expiry, formula-injection protection; inline runner under a row cap, long runner per S7 | M5.5, M0.9 | A 200k-row export completes without touching the API response limit |
| M7.2 | PDF or print path per spike S3 | M0.5 | Visual check in all three languages |
| M7.3 | Owner sign-off on layouts (B6) | M7.1 | Recorded in `DECISIONS.md` |

### M8 — Languages and polish (Blueprint phase 7, 1–2 weeks)

| ID | Task | Depends | Done when |
| --- | --- | --- | --- |
| M8.1 | Native-speaker review of every string; remove `review: pending` tags | B5 | Reviewer name and date recorded |
| M8.2 | Validation and error messages in all languages; empty/error/loading/offline states | M8.1 | Screenshot set per language |
| M8.3 | Accessibility pass (font scale 200 %, contrast, TalkBack labels on key flows) | M8.2 | Checklist |
| M8.4 | Sinhala/Tamil keyboard entry guide and credential-handout guide in the training pack | M8.1 | Doc |

### M9 — Hardening and scale proof (before pilot ends; Blueprint phase 8)

| ID | Task | Done when |
| --- | --- | --- |
| M9.1 | Security review against section 3 and 12.3, dependency audit (`npm audit`, `flutter pub outdated`) | No high/critical open |
| M9.2 | **Load test** (12.6): simulated agents over the 10:00–15:00 window, parameterised by B9, repeated before each large district | Pass criteria in 12.6; results stored |
| M9.3 | Own backups (the free tier has none): scheduled daily `pg_dump` (pooler session-mode connection), **encrypted before upload**, stored off-platform in a private location (never a public repo or artifact); **restore drill** into a fresh project | Runbook with timings; restore verified |
| M9.4 | Keep-alive so the free project never pauses; alert if the dump job fails or has not run in 36 h (GitHub can disable scheduled workflows in inactive repos, so check) | A failed run produces a notification; old dumps pruned by a documented rule |
| M9.5 | Signed release build, checksum, install on Android 10/11/12/13/14, low-end 2–3 GB device, update from an older APK | Checklist in `runbooks/release-apk.md` |
| M9.6 | **Free-tier capacity gate:** database size, egress, storage, connections and email limits versus pilot numbers and the B9 forecast (check current free-plan limits) | Numbers and the **upgrade threshold** written in `DECISIONS.md`; owner acknowledges before any rollout beyond the pilot |
| M9.7 | Cost estimate for Supabase, Vercel and email at pilot-derived volumes and at the target scale | One-page estimate for the owner |
| M9.8 | Scale rehearsal: 5 M synthetic clients, keyset queries, summary refresh time, RLS `EXPLAIN`, and a written partitioning plan (5.3) | Timings recorded |

### M10 — Pilot (Blueprint phase 8, 2 weeks)

One GN division, 5–10 agents on their own phones, accounts created by Level 4/Level 00 with generated credentials. Daily check of `sync_log`, crash reports, duplicate queue, 429 rate. Exit: pilot report with data-loss count **0**, sync success ≥ 99 %, all rejected records explained, the first real **records per agent per day** numbers (feeds B9), and a triaged fix list.

### M11 — Rollout (Blueprint phase 9, 2 weeks, then district by district)

Training material (si/ta/en), APK download page with checksum and install guide, in-app version gate, support channel, runbooks (reissue credentials, deactivate lost phone, restore backup, scale rollout). **Roll out district by district**, watching database load and error rates, rerunning the load test (M9.2) before each large district.

### M12 — iOS (later, Blueprint phase 10)

Same code on iOS, test SQLCipher, background limits (keep **Sync now**), TestFlight, App Store notes. Not part of the Android launch.

### M13 — Levels 1–3 (after launch; Level 0 blocked by B10)

| ID | Task | Done when |
| --- | --- | --- |
| M13.1 | Account creation for Levels 1–3 per 6.1, including "own team members" once B10 defines them | Matrix tests |
| M13.2 | Data entry for Levels 1–3 on mobile and web (same form; household scope per level) | Push accepts the roles; scope tests |
| M13.3 | Records views and progress per level (area and below, plus own) | Matches `can_see` |
| M13.4 | Export for Levels 1–3 within scope; edit rights per `admin_edit_levels` | Authorization matrix extended |

### 11.14 Parallel agent lanes (optional)

| Lane | Owns | Must not touch |
| --- | --- | --- |
| API | `apps/api`, migrations, OpenAPI | Flutter code |
| Mobile | `apps/mobile`, local DB, sync client | API code, migrations |
| Dashboard | `apps/dashboard` | API code, mobile screens |
| Core/UI/QA | `packages/grs_core`, `packages/grs_ui`, `docs/test-vectors`, `docs/design`, CI, traceability | Feature screens |

Contract changes go through `openapi.json` + `grs_core` first; both lanes rebase after. Migrations are owned by the API lane only.

---
---

## 12. Quality gates and test plan

### 12.1 Global Definition of Done (every task)

- [ ] Failing test written first, now passing; test names state the behaviour
- [ ] `npm run lint && npm test && npm run test:e2e` (API) and `dart format --set-exit-if-changed . && flutter analyze && flutter test` (Flutter) pass
- [ ] No new `TODO` without an entry in `OPEN-QUESTIONS.md`
- [ ] No PII or credentials in logs or fixtures (fixtures use obviously fake data)
- [ ] OpenAPI and `grs_core` updated if the contract changed
- [ ] Any screen change has the screenshots required by 4.2
- [ ] `docs/PROGRESS.md` row updated with command output or screenshot
- [ ] Any new user-facing string exists in si, ta, en

### 12.2 Layers

Unit (validators, normalizers, ID/password generators, scoring, scope), API integration against a real Postgres (Docker; not mocks), Flutter widget + golden tests for the form, badges and credential screen, Flutter integration tests with a fake API server, e2e against staging.

### 12.3 Security matrix

Table-driven: for **each endpoint × each role** assert allowed/denied and that returned rows are only in scope. Plus named tests:

- **No enumeration:** unknown ID, known ID with wrong password, locked, expired and deactivated all return the same status and message, with response times within a small tolerance
- Wrong passwords lock the account temporarily (growing delay, not permanent), and an admin can unlock; lockout does not let one attacker block everyone (limits per ID, email **and** device)
- A scope-limited first-sign-in token can call only `change-password`; an expired initial password cannot sign in
- Generated IDs match `^GRS[0-9]{10}$`, are unique under 1,000 concurrent creations, and are not sequential
- Passwords are never in logs, Sentry events, DB columns or responses other than the one creation/reset response (scan test)
- Bulk creation over the team limit creates **nobody**; 20 concurrent requests respect the limit exactly
- Level 4 cannot create accounts outside their team or above their level; Level 5 cannot create accounts
- Deactivated user's existing token → 401 on the next request
- Level 5 pushes a client into another team's house → `forbidden`
- Level 5 pushes an id that belongs to another agent → `forbidden`
- Level 4 of Team A reads Team B clients → denied (API **and** direct)
- Level 5 edits a synced record with `base_version ≥ 1` → `locked`
- Anon Supabase key reads nothing from any table
- (If direct access is on) a deactivated or reset user's valid token reads zero rows directly; direct update of `collected_by`, `household_id` or `serial_no` is rejected; Level 5 cannot INSERT/UPDATE/DELETE `clients` directly; no `SECURITY DEFINER` view exists; `anon` cannot execute any function
- CI secret scan finds no service-role key or signing secret in any app or web build
- Rate limits and lockout work across **different serverless instances** (DB-backed)

### 12.4 Offline and sync scenarios (all must pass)

1. Airplane mode: save 100 records, reconnect, exactly 100 server rows.
2. Kill the app mid-batch, relaunch: no loss, no duplicates.
3. Same batch sent twice: still one row each.
4. Edit a record while its sync is in flight: edit survives (revision guard).
5. Network switches mid-request: retry succeeds.
6. Server returns 500 for some records, 400 for others: per-record handling.
7. 426 during sync: blocking screen, data intact.
8. Foreground and background sync collide: only one runs.
9. Phone clock set one year ahead: records still accepted and ordered by `received_at`.
10. Different user signs in on the same phone: previous data not visible.
11. House deleted by L4 while an agent has pending clients for it: clients are kept, flagged, not lost.
12. 5,000 pending records sync in batches with bounded memory.
13. Server answers `429` with `Retry-After`: the app waits at least that long, then backs off with jitter, and never retries in a tight loop.
14. **Storm test:** 5,000 simulated phones regain connectivity at the same instant; request arrivals spread over the jitter window (peak 10 s window ≤ 3× the mean).
15. Response lost after a successful save: the retry returns `ok` (same `content_hash`) and no duplicate or `locked` error appears.
16. No pending records: no background task is scheduled and no request is made.

### 12.5 Release gates

- Manifest permission check (invariant 7) in CI
- APK signed, SHA-256 published, version in `app_releases`
- Install over previous version keeps local data
- Android 10 minimum verified on a real device
- Rendering check of Sinhala and Tamil on at least 3 phone brands

### 12.6 Load test (M9.2; sizes are parameters)

Tool: k6 (or similar) with a script that models an agent: sign in, download area, then save records and push small batches with the app's real pacing (jitter, debounce, backoff) during a 10:00–15:00 window.

Sizing formula: `records/s = agents × records_per_agent_per_day ÷ window_seconds`. Example only: 5,000 agents × 100 records ÷ 18,000 s ≈ 28 records/s. Replace the inputs with B9 numbers and rerun before each large district.

| Check | Pass |
| --- | --- |
| Push p95 latency at the target rate | < 2 s |
| Errors (excluding deliberate `429`) | < 1 % |
| `429/503` | Bounded, always carry `Retry-After`, and clear within minutes after the peak |
| Database | CPU, connections and pooler waits stay under agreed thresholds; no growing queue |
| Dashboards during the test | Load in < 3 s from summary tables |
| Data check afterwards | Every simulated record exists exactly once; summary tables equal source counts |

---
---

## 13. Risk register for agents (traps that cause "works on my machine" bugs)

| Trap | Defence |
| --- | --- |
| Prisma on serverless exhausts connections | Runtime via Supabase pooler; migrations via direct URL; short-lived clients; load test M9.2 |
| Vercel 4.5 MB request/response cap | Imports < 4.5 MB (friendly error); exports through Storage signed URLs; paged sync; bulk account creation ≤100 per request |
| In-memory rate limiter useless on serverless | DB-backed limiter for auth endpoints only. Sync is paced by the phones and shed by `429/503` (8.5) |
| Argon2 build or CPU cost on serverless | Spike S2; lighter parameters for generated one-time passwords only; benchmark both |
| Lost creation response means lost passwords | Never store them. Use batch **reissue** for members who never signed in (6.2) |
| Credential sheets leak (screenshots, shared chats) | Show once, forced change at first sign-in, unused-password expiry, deactivate and reset tools, training note |
| Short random IDs (10 digits) are guessable in principle | Uniform errors, per-ID/email/device limits, forced password change, temporary lockout; the ID alone grants nothing |
| Lockout abused to block people | Temporary, growing delay; limits per device as well as per ID; admin unlock |
| Thousands of phones calling at once | Jitter, batching, `429` backoff, server-tunable pacing, storm test |
| Hot rows in summary tables | Pushes only mark a team dirty; a job recomputes dirty teams from source (exact, no counter drift) |
| `pg_cron` or other helpers missing on the free tier | Spike S7 first; fallback is a scheduled external runner |
| Large exports exceed function limits | Export jobs with a row cap inline and a separate long runner (S7) |
| A wrong RLS policy exposes citizen data directly | Deny by default; policy test matrix (M1.12); schema lint; API-vs-RLS agreement; every policy change carries a test |
| NestJS-issued tokens may not work with Supabase RLS | Spike S2 decides; fallback is API-only reads (C11) |
| Free Supabase project pauses when idle, has no managed backups, and has size/egress limits | Keep-alive (M9.4), own encrypted dumps and restore drill (M9.3), capacity gate (M9.6) before any rollout |
| Vercel free (Hobby) terms vs a government campaign | Confirm the terms allow it before the pilot (blueprint). If not, move the API to another free Node host; keep code host-agnostic (Vercel-only settings stay in `vercel.json`) |
| Design skill produces web-style output or fancy motion | Section 4.2 limits: direction only, low motion, accessibility floor, form fidelity |
| Skill instructions conflict with this plan | This plan wins; record the conflict in `DECISIONS.md` |
| workmanager timing is best-effort and some phone brands kill background work | **Sync now** and sync-on-open are the guarantees; training note |
| SQLCipher library conflict | Only `sqlcipher_flutter_libs` (S4) |
| Email lands in spam; at scale needs a bigger plan | S6 with a proper domain; admins can always reset passwords without email; size the plan with B4 |
| Sinhala/Tamil text clipped | Taller line heights for these scripts; test at 200 % scale |
| Flutter Web first load heavy on weak internet | Lean dashboard, loading shell; acceptable for office users |
| Package versions drift between my notes and reality | Verify each dependency on npm/pub.dev; commit lockfiles |
| Excel house numbers coerced by Excel (`25/A` → date, `007` → 7) | Read cells as text where possible; report cells that parse as dates; text-format instructions in the template |
| Yes/No cells in three languages | Importer accepts yes/no/y/n/true/false/1/0, `ඔව්`/`නැත`, `ஆம்`/`இல்லை`; anything else is a row error, never silently false |

---
---

## 14. Agent working protocol

**Progress log row** (`docs/PROGRESS.md`): `task | status (todo/doing/done/blocked) | date | PR | evidence link or pasted output`.

**STOP-AND-ASK triggers** (write to `docs/OPEN-QUESTIONS.md`, continue with a different task):

- A field, dropdown value, label, or area name is needed that is not in this plan or the source files
- Any change that would contradict section 3 or the settled decisions (section 2.1)
- A spike returns no-go with no fallback listed here
- The data model needs a column not in section 5 or a cascade delete
- A legal, consent or data-retention question
- The meaning of Level 0, Level 1's area, or Level 1–3 "own team members" is needed (B10)
- A change that would store, log or re-display a plaintext password
- A design-skill instruction that conflicts with section 3, section 7 or the accessibility floor in 4.2
- Test results disagree with a stated acceptance number

**Never do:** invent translations and mark them reviewed; weaken or delete a failing test to get green; add dependencies without recording why; commit secrets or the keystore; bypass the scoped repository; hard-delete data; add GPS, camera or storage permissions; put the service-role key or a signing secret in any app or web build; add a direct-access policy without a policy test; keep or log plaintext passwords; use OFFSET pagination or `count(*)` on large tables for dashboards; add a fixed-interval sync timer; install a design or Flutter skill without recording it in `docs/agent-skills.md`.

---

## 15. Final acceptance checklist (project is "done" for Android launch)

- [ ] Every row of `docs/traceability.csv` has column, DTO, Dart model, form widget and export column
- [ ] All 16 offline/sync scenarios (12.4) pass on staging and on real phones
- [ ] Authorization matrix: zero cross-area leaks; anon key reads nothing; no enumeration of IDs
- [ ] Credentials: IDs and passwords generated per Appendix G, shown once, never stored or logged, first sign-in forces a change, unused passwords expire
- [ ] Spike S2 decision recorded; if direct access is on, RLS matrix and API-vs-RLS agreement tests are green
- [ ] Duplicate precision/recall targets met and reported
- [ ] Load test (12.6) passed at the agreed parameters, results stored
- [ ] Summary tables match source counts; drift check clean
- [ ] Pilot: zero data loss, ≥ 99 % sync success
- [ ] Sinhala, Tamil and English reviewed by native speakers; no clipped text; design review screenshots approved
- [ ] Own daily encrypted backup running off-platform with a **tested restore**; keep-alive running
- [ ] Free-tier capacity gate (M9.6) signed by the owner, with a written upgrade threshold
- [ ] Signed APK + checksum + install guide + in-app version gate live
- [ ] Runbooks exist: reissue credentials, deactivate lost phone, restore backup, release APK, scale rollout
- [ ] Owner has signed off report layouts, consent text, and the decisions in `DECISIONS.md`

---
---

## Appendix A — Validation rules (single source: `docs/test-vectors/validation.json`)

| Field | Rule |
| --- | --- |
| Name / house leader | Trim, NFC, collapse spaces, 2–120 chars, at least one letter (`\p{L}`); digits-only rejected |
| Age | Integer 1–120 |
| Gender | `F` or `M` |
| Phone (SL) | Strip spaces, dashes, brackets. `0094…`, `94…`, `+94…` or leading `0` → `+94` form. Valid: `^\+94[1-9][0-9]{8}$`. Store raw and normalized. |
| WhatsApp | Same as phone; other countries allowed as `^\+[1-9][0-9]{7,14}$` |
| House no. | 1–20 chars from letters, digits, `/`, `-`, space; normalized as in section 9 |
| Target counts | Integer 0–99 |
| Age group | `^\d{1,3}\s*[-–]\s*\d{1,3}$`, min ≤ max, within 0–120 |
| Email | Lowercase, trimmed, standard format; one account per email; used for login only after the code is verified |
| User ID | `^GRS[0-9]{10}$`, compared case-insensitively, stored uppercase |
| New password (chosen by the user) | ≥ 8 chars, not equal to the ID, email or previous password, not in a small common-password list |
| Future hopes | Zero or more of the five codes; no duplicates |
| Required on a client | name, age, gender, special needs, info_provided_by, consent (all else optional) |

## Appendix B — Excel template (one row per house)

Columns (header text in the chosen language; internal keys in English): `house_no*`, `house_leader_name*`, `address`, `village_name`, `aswesuma`, `etf`, `epf`, `samurdhi`, `special_needs`, `target_female`, `target_male`, `age_group`, `lang_sinhala`, `lang_tamil`, `lang_english`. `*` = required. District, DS, GN and secretary details are set once on the GN division, **not** per row. The serial number is automatic.

Import behaviour: preview shows counts and per-row errors → confirm → valid rows are saved in one transaction → `import_batches` records ok/failed counts → error report downloadable. Duplicate `house_no_norm` inside the file or against the database is a row error.

## Appendix C — Error codes (stable, translated by key)

`AUTH_INVALID` (used for every failed sign-in, see invariant 14), `PASSWORD_CHANGE_REQUIRED`, `PASSWORD_EXPIRED`, `ACCOUNT_DEACTIVATED`, `TEAM_FULL` (with free-slot count), `EMAIL_TAKEN`, `EMAIL_CODE_INVALID`, `RATE_LIMITED` (429), `SERVER_BUSY` (503), `VALIDATION_FAILED`, `FORBIDDEN_SCOPE`, `HOUSE_TAKEN`, `HOUSE_HAS_CLIENTS`, `RECORD_LOCKED`, `STALE_VERSION`, `CONSENT_REQUIRED`, `UPGRADE_REQUIRED` (HTTP 426), `IMPORT_TOO_LARGE`, `IMPORT_ROW_INVALID`, `BULK_TOO_LARGE`.

## Appendix D — Environment and secrets checklist

API: `DATABASE_URL` (pooler), `DIRECT_URL`, `JWT_ACCESS_KEY` (and public key if asymmetric, per S2), `JWT_REFRESH_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (only if direct access is enabled), `SUPABASE_SERVICE_ROLE_KEY` (server only), `SMTP_URL` or `EMAIL_API_KEY`, `SENTRY_DSN`, `ANDROID_MIN_VERSION`, `INITIAL_PASSWORD_TTL_DAYS`. Mobile and web builds: `API_BASE_URL`, `SENTRY_DSN`, and `SUPABASE_URL` + `SUPABASE_ANON_KEY` (public key only) **only if** direct access is enabled. CI: keystore (base64), keystore password, key alias/password, backup encryption key. Different values per environment; rotate on any suspicion of leak.

## Appendix E — Districts to seed (English names; Sinhala and Tamil names must come from an official list, do not guess)

Ampara, Anuradhapura, Badulla, Batticaloa, Colombo, Galle, Gampaha, Hambantota, Jaffna, Kalutara, Kandy, Kegalle, Kilinochchi, Kurunegala, Mannar, Matale, Matara, Monaragala, Mullaitivu, Nuwara Eliya, Polonnaruwa, Puttalam, Ratnapura, Trincomalee, Vavuniya (25).

## Appendix F — Draft education ladder (owner must replace or approve in `docs/lookups.md`)

No schooling · Grade 1–5 · Grade 6–10 · G.C.E. O/L passed · G.C.E. A/L passed · Certificate/Diploma · Higher Diploma · Bachelor's degree · Postgraduate. Vocational qualification, vocational stream and job lists: **owner-supplied only (B1)**.

## Appendix G — Generated credentials (single source: `docs/test-vectors/ids.json`)

| Item | Rule |
| --- | --- |
| ID | `GRS` + 10 digits from a cryptographically secure random source (leading zeros allowed). Not sequential, not derived from name, phone or area. Insert with retry on unique violation. |
| Password | Cryptographically secure random, **12 characters** from an alphabet without look-alikes (no `0 O o 1 l I`, no symbols), easy to type on a phone and to read from a printed sheet. Group as `XXXX-XXXX-XXXX` for display only; the dashes are not part of the password and are ignored on input. |
| Storage | Argon2id hash only. Parameters per spike S2 (lighter set allowed for these one-time passwords). |
| First use | Must be changed at the first sign-in (needs internet). Expires after `INITIAL_PASSWORD_TTL_DAYS` if never used (C14). |
| Display | Once, on the creating admin's screen or in the sheet built from the creation response. Not retrievable later. Lost? Reset or batch reissue. |
| Sheet | Columns: name, role, team, ID, password, language. Built in the browser or app; cells injection-safe; carries a "keep private, change at first sign-in" notice in three languages. Never uploaded to Storage. |
| Tests | 100k generated IDs: format valid, no duplicates, no obvious sequence; passwords: alphabet and length valid; none appear in logs or DB. |
