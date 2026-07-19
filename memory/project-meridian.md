---
name: project-meridian
description: "Meridian — McDonald's district operations analytics tool, migration status, architecture, and deployment state"
metadata: 
  node_type: memory
  type: project
  originSessionId: cc259420-bc20-4259-b5f9-800bf256cd33
---

# Meridian — McDonald's District Analytics Tool

**What it is:** A personal operations analytics dashboard for a McDonald's district manager. Tracks sales forecasting, labor metrics, ops scores, register audits, morning briefs, coaching, and more across ~27 stores.

**Why it was migrated:** The original app was a single 27,862-line HTML file. The migration goal is a structured React + TypeScript + Vite project so it can be hosted permanently (GitHub Pages / Netlify) and maintained cleanly.

**Current version:** v4.231 — Supabase integration committed; user setting up Supabase before going live

**Migration status (as of 2026-06-23):** COMPLETE
- `src/meridian.js` is now 37 lines (entry point only)
- All features extracted to ~20+ module files under `src/`
- Production build passes clean (`npm run build`)
- 33 automated tests pass (`npm test`)
- Two missing imports were found and fixed during test authoring (`DEFAULT_TARGETS` and 5 functions in `backtest.js`) — the tests pay for themselves immediately

**Why:** The migration enables permanent hosting on GitHub Pages/Netlify so users can bookmark a URL instead of opening a local file, and enables proper test coverage and ongoing maintenance.

**How to apply:** Project is live on GitHub Pages. Supabase (Stack A) integration is committed — user is in process of completing Supabase dashboard setup. Remaining online data work: KPI data (sales/volume/speed/DOW) sync layer deferred to a future session.

## Supabase Integration (v4.231)
- Auth: passwordless magic-link email; Azure AD migration path documented
- Graceful degradation: full local-only mode when env vars absent (no behavior change)
- RLS roles: `admin` (all), `supervisor` (accessible_locs), `manager` (own store locs)
- **Synced**: performance reviews + review config
- **Still localStorage-only**: KPI data — full online layer planned, user will revisit
- Tables: profiles, reviews, org_config, staff_assignments

## Online Data Layer — Planned (not yet built)
Add `store_data` table for KPI uploads so data is shared across devices per store.
Same sync pattern as reviews; RLS on accessible_locs handles permissions automatically.
User priority: finish review features first, then tackle this.

## Key architecture facts

- **Stack:** Vite 8 + React 19 + plain JS (// @ts-nocheck throughout — no TypeScript in src/)
- **Data persistence:** Dexie.js (IndexedDB) — data survives page refresh but is browser-local
- **Test framework:** Vitest (not Jest) with fake-indexeddb for DB tests
- **Entry point:** `src/meridian.js` → imports `App.js` → all feature modules

## Module map (src/)

```
meridian.js          — 37-line mount point
app/App.js           — main App component + all imports
app/shell.js         — AppShell, nav, top bar
constants.js         — STORE_NAMES, DEFAULT_TARGETS, DEF_SETTINGS, etc.
meridian.css         — all styles

engine/
  forecast.js        — forecastDay, compute6wk, fetchLY, effectivePlusUp, etc.
  backtest.js        — calibrateStore, runModelAssignmentBacktest
  pipeline.js        — buildDS, mergeDS, buildStore, computeOpsScore
  coaching.js        — GMCoachingBrief
  why.js             — forecast explanation engine

features/
  morning-brief.js   — MorningBriefPanel, computeMorningBrief
  calendar.js        — CalendarManagerPanel, recurring rules
  session.js         — ErrorBoundary, mfExportSession, mfRestoreSession, SessionBanner
  projections.js     — ProjectionsPanel
  location-intel.js  — LocationIntelPanel
  lifelenz.js        — LifeLenzPanel
  smart-targets.js   — SmartTargetsPanel

views/
  analytics.js       — AnalyticsPanel
  store-dash.js      — StoreDashboard
  store-analytics.js — StoreAnalyticsPanel
  management.js      — ManagementPanel
  inventory.js       — InventoryPanel
  labor-tools.js     — LaborToolsPanel

parsers/index.js     — all 27 file parsers (parseRaw, parseLaborData, etc.)

db/index.js          — Dexie wrapper: idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta, idbClearAll

utils/
  date.js            — addD, dKey, dowOf, mwStart
  fmt.js             — f$, fPct, fP, fN, TH, grade, gLbl, gCol, gBg, gBdr
  holidays.js        — isHoliday, getHolidayAdj
  register-audit.js  — analyzeRegisterAudit
```
