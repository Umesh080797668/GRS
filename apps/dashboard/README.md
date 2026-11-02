# GRS Civic Web Dashboard (Next.js 16 + Cloudflare Pages)

The national administrative and monitoring web dashboard for the **Door-to-Door National Skills Census 2026** (දොරින් දොර කුසලතා සංගණනය 2026 / வீடு வீடாக திறன் பிரச்சாரம் 2026).

Built with **Next.js 16 App Router**, **React 19**, **TypeScript**, and modern **Vanilla CSS** design system. Configured for zero-server, high-performance static hosting on **Cloudflare Pages**.

---

## 🚀 Cloudflare Pages Deployment Guide

When creating a new Cloudflare Pages project linked to your Git repository:

### 1. Build & Project Configuration
| Setting | Value |
|---|---|
| **Project Name** | `grs-dashboard` (or preferred name) |
| **Framework preset** | `None` / `Next.js (Static HTML Export)` |
| **Root directory** | `apps/dashboard` |
| **Build command** | `pnpm build` |
| **Build output directory** | `out` |
| **Deploy command (if asked)** | Leave **blank** or `npx wrangler deploy` |

> [!TIP]
> **Fast Deployment:**
> - If deploying via **Cloudflare Pages**: Leave the "Deploy command" **empty/blank**. Cloudflare Pages automatically deploys the `out` directory in seconds without running Wrangler.
> - If deploying via **Cloudflare Workers / Wrangler CLI**: The project includes [`wrangler.jsonc`](./wrangler.jsonc) with `"assets": { "directory": "./out", "not_found_handling": "single-page-application" }`. This bypasses `@opennextjs/cloudflare` migration entirely and directly uploads the pre-built static export in **under 3 seconds**!


### 2. Environment Variables
Configure the following in the Cloudflare Pages **Settings → Environment variables**:

| Variable | Recommended Production Value | Description |
|---|---|---|
| **`NEXT_PUBLIC_API_BASE_URL`** | `https://grs-umber-eight.vercel.app` | NestJS REST API endpoint |
| **`NODE_VERSION`** | `20.18.0` (or `22.x`) | Node runtime for build step |

### 3. Client Routing & SPA Deep-Linking
- Cloudflare Pages utilizes `public/_redirects` which redirects all non-file requests (`/* /index.html 200`) to the client-side router, preventing 404 errors on browser page reloads or deep links (e.g. `/progress`, `/users`, `/records`).
- Caching policies and security headers (Content-Security-Policy, X-Frame-Options, HSTS) are declared in `public/_headers` and automatically exported into `out/_headers`.

---

## 🛠 Local Development

### Prerequisites
- Node.js `≥ 20.x`
- `pnpm` (`npm install -g pnpm`)

### Running Locally
```bash
# Navigate to dashboard app
cd apps/dashboard

# Install dependencies
pnpm install

# Start development server on http://localhost:3000
pnpm dev
```

### Building & Testing Static Export
```bash
# Generate production static export in apps/dashboard/out
pnpm build

# Test static bundle locally using serve
npx -y serve out -p 8080
```

---

## 🌟 Key Capabilities (Milestone 5)

1. **Trilingual Language Engine (M5.1):** 100% key parity across Sinhala (සිංහල), Tamil (தமிழ்), and English.
2. **User Management & Credential Slips (M5.2):** Single and bulk account creation (≤ 100 chunked), in-browser credential slip printing (`@media print`), and formula-injection safe CSV exports (escaped `=,+,-,@`).
3. **Geographic Hierarchy & Pilot Area Import (M5.3):** Multi-level drill-down (Districts → DS Divisions → GN Divisions → Field Teams) and pilot area CSV bulk creation.
4. **Excel/CSV Household Import (M5.4):** 4.5 MB cap check, client-side row validation, valid-only commit, and sanitized error report CSV.
5. **Survey Records & Supervisor Audit (M5.5):** Keyset cursor-paged inspection table with mandatory correction reason audit logging.
6. **Live Progress Dashboard (M5.6):** Materialized SQL aggregation KPIs with `refreshed_at` timestamps and on-demand refresh.
7. **Sync Health Monitor (M5.7):** Real-time tracking of field teams with pending or unaggregated sync data.
8. **Online Admin Data Entry (M5.8):** Direct paper form entry (DD/S/001 & DD/S/002) with Decision C19 administrative safety gates.
9. **Civic Typography & XLSX Benchmark (Spike S5):** Live specimen for Noto Sans fonts and in-browser 3.39 MB spreadsheet processing.
