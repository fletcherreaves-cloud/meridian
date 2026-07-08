# Meridian BI — Claude Code Project Context

> Read at every session start. Dense by design — power-user reference, not an intro doc.

---

## What Is Meridian

Meridian is a full-stack operations analytics platform for a McDonald's franchise owner (~27 stores in Florida and Oklahoma). It replaces disconnected spreadsheets by aggregating data from LifeLenz (labor/scheduling), QSRSoft (P&L/food cost), SMG VOICE (customer satisfaction), daily ops reports, and more into a unified dashboard.

Long-term vision: a restaurant management **intelligence system** — not just a data viewer — that helps owners and operators manage performance, coach GMs, and run the business with data they currently can't access in one place.

Built and used by the same person (Fletcher Reaves, owner + developer). Currently private; future plan is to deploy to a second trusted operator in beta.

---

## Stack & Deployment

| Layer | Technology |
|---|---|
| Frontend | Vite + React 19 + vanilla JS (`// @ts-nocheck` throughout — no TypeScript in src/) |
| Database / Auth | Supabase (PostgreSQL + magic-link auth + Deno Edge Functions) |
| Hosting | Vercel → https://meridianbi.vercel.app |
| Repo / CI | GitHub (fletcherreaves-cloud/meridian), Actions for daily LifeLenz + QSRSoft sync |
| Client cache | Dexie.js (IndexedDB / OPFS) — fallback only, not source of truth |
| PDF parsing | pdfjs-dist (lazy-loaded) |
| Automation scripts | Node.js + Playwright (`scripts/lifelenz-pull.mjs`, `scripts/qsrsoft-ebos-pull.mjs`, `scripts/qsrsoft-dar-pull.mjs`) |

**Dev commands:**
- `npm run dev` — local dev server
- `npm run build` — production build (must pass clean)
- `npm test` — Vitest suite (33+ tests)

---

## Architecture (Cloud-First)

**Goal:** any device, any user logs in and sees the same data. No re-uploading after device or URL switch.

- Data saved to Supabase on upload → loaded from Supabase on login
- OPFS still used for session caching, but Supabase is the source of truth
- RLS on all tables via `accessible_locs` in the `profiles` table
- Auth: Supabase magic-link email; RBAC roles set in `profiles.role`

**Key files:**
```
src/meridian.js        — 37-line entry point
src/app/App.js         — main App component, all imports
src/app/shell.js       — AppShell, nav, top bar
src/constants.js       — STORE_NAMES, DEFAULT_TARGETS, DEF_SETTINGS
src/meridian.css       — all styles

src/engine/            — forecast, backtest, pipeline, coaching, why
src/features/          — morning-brief, calendar, session, projections,
                         location-intel, lifelenz, smart-targets
src/views/             — analytics, store-dash, store-analytics,
                         management, inventory, labor-tools, sage, signals
src/parsers/index.js   — all 27+ file parsers
src/db/index.js        — Dexie wrapper
src/utils/             — date, fmt, holidays, register-audit

supabase/functions/    — Edge Functions (sage-chat, qsrsoft-ingest, etc.)
scripts/               — lifelenz-pull.mjs, qsrsoft-ebos-pull.mjs, qsrsoft-dar-pull.mjs
.github/workflows/     — lifelenz-pull.yml, qsrsoft-ebos-pull.yml, qsrsoft-dar-pull.yml
                         (all run daily at 10:00 UTC = 5am CDT)
```

---

## External Data Sources

| Source | Status | How |
|---|---|---|
| LifeLenz (labor/scheduling) | ✅ Automated | GitHub Actions daily sync, REST API, X-Auth-Token secret → `lifelenz_schedules` |
| QSRSoft eBOS Purchases | ✅ Automated | GitHub Actions daily, Playwright auth → `qsr_ebos_daily` |
| QSRSoft Daily Activity (DAR) | ✅ Automated | GitHub Actions daily 10:00 UTC, Playwright auth, all 27 stores/hour → `qsr_daily_activity` |
| QSRSoft P&L / Food Cost | 🔄 Partial | Email pipeline: Apps Script → Edge Function; also manual CSV upload |
| SMG VOICE (CSAT) | 📤 Manual | PDF drop (comments) + Excel drop (FullScale aggregate) |
| Operations Report | 📤 Manual | Excel upload |
| FOB / Food Cost | 📤 Manual | Excel upload → `ds.fobRows` |
| Monthly Targets | 📤 Manual | Excel drop → auto-saved to Supabase `monthly_targets` |
| DAR / Controls | 📤 Manual | Excel upload (separate from QSRSoft DAR above) |

**Automation principle:** automate everything eventually; always keep manual upload as fallback.

**Automated scripts:** all three pull scripts use a two-path auth: direct token (fast) → Playwright fallback if 401 (captures fresh session). Token secrets: `LIFELENZ_TOKEN`, `QSRSOFT_TOKEN`, `QSRSOFT_USERNAME`, `QSRSOFT_PASSWORD`.

**LifeLenz token:** `LIFELENZ_TOKEN` GitHub Secret. Expires (roughly monthly). When sync fails with 401/403, refresh manually: DevTools → Network → any `us01-connect.lifelenz.com` request → copy `X-Auth-Token` header → update GitHub Secret. See `memory/lifelenz-session.md` for full runbook.

**QSRSoft token:** `QSRSOFT_TOKEN` GitHub Secret. Same refresh process: DevTools → Network → any `api.reports.myqsrsoft.com` or `v3.myqsrsoft.com` request → copy `X-Auth-Token` header → update GitHub Secret.

---

## RBAC Roles (most → least access)

| Role | Scope |
|---|---|
| Developer | Full access + dev tools (Fletcher) |
| Admin | Full operational access, no dev tools |
| Owner / OO | Org-level view |
| VP | Multi-district |
| DO | District-level |
| Supervisor | Patch-level (subset of stores) |
| GM | Own store only |
| Office Staff | Read-only |

Roles enforced via Supabase RLS on `accessible_locs` profile field. Nav items and data views gate by role.

---

## UI Conventions

- **Theme:** Bloomberg-inspired dark. Background `#0f1117`, accent `#f5bc00` (McDonald's gold)
- **Density:** power-user tool — dense, data-first layouts (not consumer-friendly)
- **Location selectors:** pill-style, All → State → Org/Patch → Store hierarchy on all filters
- **Print/PDF:** export formatting should match existing workbook aesthetic
- No emoji in UI unless already used for nav icons

---

## Panels & Modules

| Panel | Status | Notes |
|---|---|---|
| Morning Brief | ✅ | Daily KPI summary |
| Projections | ✅ | Monthly targets, Supabase-persisted |
| Analytics | ✅ | District-wide rollup |
| Store Dashboard / Analytics | ✅ | Per-store drill-down |
| Labor Tools + LifeLenz | ✅ | Scheduling intelligence, synced daily |
| Management | ✅ | Coaching, performance reviews |
| Inventory | ✅ | |
| SMG VOICE | ✅ | Comments tab + FullScale scorecard; thresholds TBD |
| Location Intel | ✅ | |
| Calendar Manager | ✅ | Recurring rules |
| Smart Targets | ✅ | |
| Data Manager | ✅ | Needs updated for all new file types |
| SAGE AI | ✅ | Claude Opus 4.8-powered chat, fully deployed |
| Signals | 🔄 | Operational alert/pattern surface — in progress |
| FOB / Food Cost | ❌ | Data parsed, no dedicated panel yet |
| Feature Requests | ❌ | Module to track and surface user-requested features |

---

## SAGE (Strategic Analytics & Guidance Engine)

AI advisor built into Meridian. Fully deployed at v4.284.

- **Architecture:** `supabase/functions/sage-chat/index.ts` (Deno Edge Function, proxies Claude API, verifies Supabase JWT) + `src/views/sage.js` (React panel, SSE streaming)
- **Model:** `claude-opus-4-8` with `thinking: {type: "adaptive"}`, `max_tokens: 8000`
- **Deploy command:** `supabase functions deploy sage-chat --no-verify-jwt` (`--no-verify-jwt` required for CORS)

**Vision (future enhancements):**
- All-in-one: reporting + diagnostic + coaching in one interface
- Cross-device session memory and conversation retention
- Action plans, tables/charts in responses, copy/email output
- Prompt catalog with thumbs-up/down rating
- RBAC-aware (what SAGE sees/recommends depends on caller's role)
- Tool use: SAGE queries Supabase directly for live numbers

---

## Top Priorities (as of 2026-07-08)

**Automation ceiling reached (v4.356).** Three live data streams now run unattended: LifeLenz, QSRSoft eBOS purchases, and QSRSoft Daily Activity (hourly intraday data for all 27 stores). Next phase: build intelligence on top of this data.

1. **Data Manager sync times** — show schedule ("Daily ~5am CDT") + last-synced timestamp from `max(updated_at)` for each auto-sync table. See `memory/project-backlog.md`.
2. **Morning Brief hourly pace** — today's sales pace vs 30-day mean from `qsr_daily_activity`. Real-time "how is today tracking?" answer without logging into QSRSoft.
3. **Store Dashboard daypart card** — aggregate hour slots to Breakfast/Lunch/PM/Dinner/Late from `qsr_daily_activity`. Show vs projection, vs LY.
4. **Signals panel** — use `qsr_daily_activity` as primary source: DT serve time vs mean by slot, sales pace vs mean, labor vs needed. See `memory/project-backlog.md` for alert criteria.
5. **Projections: add QSRSoft baseline** — `proj_sales_dollars` from `qsr_daily_activity` as a second comparison line (Meridian target vs QSRSoft projection vs actual).
6. **FOB / Food Cost panel** — data exists in `ds.fobRows`, needs a dedicated panel.
7. **Supabase persistence** — move `fobRows`, `opsRows`, `ctrlRows`, `darRows`, `smgFullscale` from OPFS → Supabase (cloud-first, cross-device). See `memory/project-supabase-priority.md`.
8. **Operator Summary rework** — rename + group selector (Patch / Operator / Company / Org).

---

## Dev Rules

- **Never break working features.** Every commit should leave the app fully functional.
- `npm run build` must pass clean before commit.
- No TypeScript — plain JS with `// @ts-nocheck`.
- Every new persistent data type goes into Supabase (save on upload + load on startup). Ask "does this belong in Supabase?" for every new data model.
- Automate data sources where possible; always keep manual upload as fallback.
- Version bump with each significant feature: `v4.xxx` in commit message.
- Performance reviews: do not hard-code org names (remove "Murphy Family Restaurants" refs).
- When adding LifeLenz API features: do NOT re-investigate GraphQL `GetPdfReportsBusinessOfficeLocations` (returns location IDs, not schedule IDs). See `memory/lifelenz-session.md` for dead ends.
- **QSRSoft DAR API auth:** `api.reports.myqsrsoft.com` requires browser session cookies — server-side Node.js fetch with token alone returns 401. Must use Playwright in-browser fetch (`page.evaluate()`) with explicit `X-Auth-Token` header (no `credentials: 'include'`). Use one `page.evaluate()` per date, not one evaluate with an internal loop (the latter hangs with no output). See `memory/project-qsrsoft-daily-activity.md`.
- **`qsr_daily_activity` table:** PK is `(loc, dt, hour_slot)`. `loc` = NSN zero-padded to 7 chars. `hour_slot` = `endQtrHourTime` (e.g., "06:00" = 5am–6am block). LY fields use `ly_` prefix in DB (mapped from `ly.*` dot-notation in API response).

---

## Organization Context

- **~27 stores total:** ~6 Florida + ~20 Oklahoma
- **FL stores (MCDOK):** Freeport, Mossy Head, Cottondale, Bonifay, DeFuniak Springs, Chipley-St.Rd.77, Ponce de Leon
- **OK stores (Emerald Arches):** Tishomingo, Holdenville, Harrah, Tecumseh, Elgin, Marietta, Sulphur, Pauls Valley, Duncan, Ardmore, OKC-I-240/Sooner, Lindsay, Madill, Purcell, Seminole, Atoka, Ada, Durant, Chickasha, and others
- **LifeLenz Business ID:** `01979dbf-a166-759b-8702-aba9915c578e`
- **Supabase URL:** from `VITE_SUPABASE_URL` env var
- **User:** Fletcher Reaves (fletcher.reaves@mcreaves.com) — owner, developer, primary user

Org config (territory groupings, patch assignments, etc.) is configurable in Supabase `org_config` table — not hard-coded — to support future multi-org deployments.

---

## Memory Files (detailed context)

Full index in `memory/MEMORY.md`. Key files:

| File | What's in it |
|---|---|
| `memory/lifelenz-session.md` | LifeLenz API runbook, dead ends, token refresh steps |
| `memory/project-backlog.md` | Feature backlog from field notes |
| `memory/project-supabase-priority.md` | Supabase migration status — what's in, what's not |
| `memory/project-sage.md` | SAGE deployment details, enhancement ideas |
| `memory/project-qsrsoft-pipeline.md` | QSRSoft email pipeline, Apps Script, Edge Function |
| `memory/project-qsrsoft-daily-activity.md` | DAR automation — confirmed endpoint, response schema, table SQL, auth pattern |
| `memory/project-perf-reviews.md` | Performance review system details |
| `memory/feedback-selector-ui-standard.md` | Location filter UI standard |
