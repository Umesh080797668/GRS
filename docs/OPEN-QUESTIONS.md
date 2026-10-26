# GRS Project — Open Questions & Blockers Log

This document tracks items requiring client/owner clarification per Agent Build Plan v1.2 §2.3.

## Human Blockers & Pending Inputs

| # | Item | Status | Stand-in while waiting | Milestone Needed |
| --- | --- | --- | --- | --- |
| **B1** | Final dropdown lists (vocational qualification, vocational stream, jobs) | Pending Owner Input | `docs/lookups.md` seeded with `TODO_OWNER` codes. Draft education ladder from Appendix F used as baseline. | M1.6 |
| **B2** | Consent statement wording (Sinhala/Tamil/English) & PDPA data controller entity | Pending Owner Input | Key `consent.v0` flagged with `[DRAFT]` badge in UI. | M2.9 |
| **B3** | Official pilot area hierarchy (District, DS, GN divisions, team limits) | Pending Owner Input | Synthetic test fixture `TEST-GN-001` with realistic constraints. | M1.7 |
| **B4** | Production transactional email provider & verified sending domain (SPF/DKIM) | Pending Owner Input | Console mailer / test SMTP driver in local and dev environments. | M1.15 |
| **B5** | Native-speaker review of Sinhala and Tamil UI/error strings | Pending Review | Machine-translated drafts flagged with `review: pending`. | M8.1 |
| **B6** | Client sign-off on custom Excel & PDF report templates | Pending Sign-off | Default report layouts implemented per Plan §10 (R1–R5). | M7.3 |
| **B7** | Sample Sri Lankan election name-list file for Excel template calibration | Pending Sample | Synthetic test file matching official format specifications. | M5.4 |
| **B8** | Formal confirmation of required vs optional client form fields | Awaiting Confirmation | Appendix A defaults used as authoritative validation baseline. | M2.8 |
| **B9** | Expected initial launch agent headcount and target records per agent per day | Pending Metric | Parameterized load test suites (k6) using configurable scale dials. | M9.2 |
| **B10** | Definition of Level 0 role and Level 1–3 "own team members" | Post-Launch Scope | Deferred to M13 (not blocking Android launch). | M13 |
| **B11** | Confirmation of "who creates whom" matrix and 30-day initial password expiry | Confirmed as Default | Defaults C14 & C15 implemented. | M1.4 |

## Agent Stop-and-Ask Log

*(Agents must log any unresolvable conflict, missing required field, or security invariant violation here before proceeding with an alternative task).*
- None currently.
