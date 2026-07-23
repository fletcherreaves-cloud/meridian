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
| QSRSoft eBOS Purchases | ✅ Automated | GitHub Actions daily 10:00 UTC, Playwright auth, all 27 stores → `qsr_ebos_daily` |
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
| SMG VOICE | ✅ | Comments tab + FullScale scorecard; thresholds set (OSAT ≥90%, Acc B2B ≥95%) |
| Location Intel | ✅ | |
| Calendar Manager | ✅ | Recurring rules |
| Smart Targets | ✅ | |
| Data Manager | ✅ | |
| SAGE AI | ✅ | Claude Opus 4.8, live tool use (sales/DT/labor/forecast accuracy), streaming |
| Signals | ✅ | LiveOps tab (qsr_daily_activity): Tracking-to-Plan (proj_sales_dollars), Baseline Anomalies (mean_sales), intraday labor-gap column; Speed of Service panel (all stations: DT/front-counter/kitchen-MFY/beverage); custom signal engine |
| FOB / Food Cost | ✅ | FOBAnalysisPanel + FOBEOMPanel (per-store inventory troubleshooter) |
| Feature Requests | ✅ | Supabase-backed, pre-seeded with roadmap history |

---

## SAGE (Strategic Analytics & Guidance Engine)

AI advisor built into Meridian. Fully deployed at v4.284.

- **Architecture:** `supabase/functions/sage-chat/index.ts` (Deno Edge Function, proxies Claude API, verifies Supabase JWT) + `src/views/sage.js` (React panel, SSE streaming)
- **Model:** `claude-opus-4-8` with `thinking: {type: "adaptive"}`, `max_tokens: 8000`
- **Deploy command:** `supabase functions deploy sage-chat --no-verify-jwt` (`--no-verify-jwt` required for CORS)

**Live tools (v4.373–v4.379):** `query_daily_activity` (sales + DT), `query_lifelenz_labor` (VLH gap), `query_forecast_snapshots` (MAPE by model). System prompt documents tools explicitly so SAGE calls them proactively.

**Self-instrumenting + prompt library (v4.487):** every SAGE answer has a **🐞 Log** action → opens a modal that turns the response into a **Task Queue** ticket (data-pull failures) or **Feature Request** (capability gaps) — auto-suggested by failure-language + data-source detection (`query_daily_activity`/`query_lifelenz_labor`/`query_forecast_snapshots`), pre-filled with the Q+A context AND a ready-to-paste **troubleshooting prompt** for Claude Code. Header **📚 Prompts** = saved-prompt library (`sage_prompts` table): save the current input, Use/Run/Delete saved prompts. **Phase 2 (planned):** auto-schedule prompts via a GitHub Action (`scripts/sage-run.mjs` + `SAGE_RUNNER_EMAIL/PASSWORD` service account to mint a user token — the edge fn validates a real user JWT) → results to an At-A-Glance tile. `send`→`sendMessage(text)` refactor already supports headless invocation.

**Vision (future enhancements):**
- Cross-device session memory and conversation retention
- Action plans, tables/charts in responses, copy/email output
- Prompt catalog with thumbs-up/down rating
- RBAC-aware (what SAGE sees/recommends depends on caller's role)

---

## Top Priorities (updated 2026-07-20, post v4.426 — Data-Refresh sprint)

**Data-Refresh sprint shipped (v4.406–v4.426), all live in production:**
- **Emailed QSRSoft reports now parse server-side into Supabase.** `scripts/qsrsoft-email-parse.mjs` (GitHub Action, `.github/workflows/qsrsoft-email-parse.yml`, 1pm+4pm CT) reads the CSVs the ingest pipeline drops in the `qsr-reports` bucket, parses them with the SAME `src/parsers` functions the client uses (zero drift), and upserts to new tables **`sales_ledger_daily` / `daily_glimpse_daily` / `cash_sheet_daily`**. Previously these parsed client-side on login into device-local IDB only. Now channel mix / 3PO / OEPE / KVS / controls are cloud-fresh on every device.
- **At A Glance tiles use freshest-wins** (manual upload overrides same-day; auto fills the gap since last upload). Digital Sales ← Sales Ledger; Service (OEPE/KVS) ← Daily Glimpse; Controls ← Glimpse+Cash; Labor % ← Glimpse; **FOB ← qsr_fob, dollar-weighted** (Σ$/ΣprodSales, not straight avg) showing current MTD + last completed month.
- **Freshness banner** re-anchored to the newest date across all auto streams (fixed the false "data X days old"). Root cause also fixed: `loadQsrActSummary` was truncating at Supabase's 1000-row cap (now paginated).
- **Movers strip** on At A Glance (top sales-vs-LY movers, slowest DT, stores behind LY — cloud-fresh).
- **In-app Sync buttons** (Data Manager) dispatch any pull workflow; **intraday DAR** at ~8a/10a/2p CT.
- **Ops Report guard**: refuses period-summary uploads (no daily dates) — daily rows are the source of truth.
- **OK/FL market pills fixed**: were defaulting all stores to MCDOK (FL pill empty); now split by `INV_ORG_COORDS.state` (OK=20 Oklahoma, FL=7 Florida).

⚠️ **Pending user action:** Run these SQL blocks from `supabase/schema.sql` (each fails soft — the app works without them, just won't persist): **`forecast_snapshots`** (still not confirmed), **`smart_target_adjustments`** (v4.486 — Smart Targets known-event Adj column), **`sage_prompts`** (v4.487 — SAGE saved-prompt library). The 3 email-report tables are already created.

**🎯 Smart Targets — sales-model verdict (v4.483, 2026-07-23):** a 27-store backtest proved the **simple trailing family (T3M/T6W/T3W · recent-3wk · 3-mo-avg) beats every engineered model** for monthly store sales (Composite/Momentum/Regression/Ensemble won **0 stores**; ~5% MAPE vs 8–14%). The three simple methods are **tied**, so the recommended **Smart number is now the MEDIAN of the three** (not "best-fit per store" — that chased n=2 noise; not the old unproven peer-blend, which is kept as a secondary "stretch"). Backtest **decoupled from the learning window** (`BT_DAYS=400`, `BT_FOLDS=6`). **Engineered models are PRESERVED intact, on demand** ("＋ Diagnostic models"), for diagnosis + potential longer-range use — standing owner directive: cautiously protect them. Details in `memory/vision-and-roadmap.md` (Workstream B, Layer 3).

**⭐ North-star & roadmap (2026-07-21):** see `memory/vision-and-roadmap.md` — accuracy-integrity system (P0), Smart Targets Model v2 for all metrics (P1), Projections current-month actuals + DT weekly-trend (P1), UX coherence pass + panel scorecard (P2), Graded-Visit Predictor for CFV/RGR/Ecosure + novel composite indices (P3), multi-user then multi-tenant deployment (P4). Standing rules: correct math, never average averages, dollar-weight aggregates, self-audit every report.

**Next candidate areas:**
- Phase-2 bugs: Projections weekly-view crash on location expand; Signals won't close on mobile; Market Intelligence weather stopped showing.
- FR: TPPH auto-target calc; Projections vs Actuals. "As of [date]" labels on tiles.
- SAGE conversation persistence, RBAC awareness; yearly projections view.

---

## Dev Rules

- **Never break working features.** Every commit should leave the app fully functional.
- `npm run build` must pass clean before commit.
- No TypeScript — plain JS with `// @ts-nocheck`.
- Every new persistent data type goes into Supabase (save on upload + load on startup). Ask "does this belong in Supabase?" for every new data model.
- Automate data sources where possible; always keep manual upload as fallback.
- **Auto/emailed-first, freshest-wins (standing rule).** Every tile/column must be fed by an auto-pulled or emailed cloud stream (DAR `qsr_daily_activity`, `qsr_fob`, `qsr_ebos_daily`, `lifelenz_schedules`; emailed `daily_glimpse_daily`/`sales_ledger_daily`/`cash_sheet_daily`). Manual uploads (`laborRows`/`ctrlRows`/`opsRows`/FOB Excel) are **last-resort fill only** — they may fill a loc/date the cloud doesn't cover yet but must **never override** auto/emailed data or be a tile's primary source. Manual data is device-local IDB (blank on other devices, stale past the last upload). See `memory/project-data-redundancy.md`.
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
| `memory/vision-and-roadmap.md` | ⭐ North-star vision, Smart Targets Model v2 design, accuracy-integrity system, UX-coherence scope, deployment paths, prioritized roadmap |
| `memory/lifelenz-session.md` | LifeLenz API runbook, dead ends, token refresh steps |
| `memory/project-backlog.md` | Feature backlog from field notes |
| `memory/project-supabase-priority.md` | Supabase migration status — what's in, what's not |
| `memory/project-sage.md` | SAGE deployment details, enhancement ideas |
| `memory/project-qsrsoft-pipeline.md` | QSRSoft email pipeline, Apps Script, Edge Function |
| `memory/project-qsrsoft-daily-activity.md` | DAR automation — confirmed endpoint, response schema, table SQL, auth pattern |
| `memory/project-perf-reviews.md` | Performance review system details |
| `memory/feedback-selector-ui-standard.md` | Location filter UI standard |
