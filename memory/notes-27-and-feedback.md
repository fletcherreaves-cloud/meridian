---
name: notes-27-and-feedback
description: Owner "Notes 27" + live preview feedback (2026-07-24) on the v4.512–v4.525 work. Key theme — a SYSTEMATIC vs-LY / stale-data problem: panels read manual uploads only, so recent windows show missing/broken data. Plus VR refinements and Panel Manager / Profile / Data Manager tweaks.
metadata:
  node_type: memory
  type: project
---

# Notes 27 + preview feedback (owner, 2026-07-24)

## 🔴 SYSTEMATIC ROOT CAUSE (highest priority)
Many panels read **manual uploads only** (`laborRows`/`ctrlRows`/`opsRows`), which are stale, so
recent windows compare a **partial current period against a full last year** → false ~-30% (or
-100% on guests), or blank "—". This is the "vs-LY wrong / seen in other areas" pattern.
**Fix pattern = AUTO-FIRST + MATCHED-DAY** (current sales/GC from manual OR the auto DAR
`qsrActSummaryRows`; a day counts only when BOTH years have data).

Fixed so far:
- ✅ At-A-Glance Sales tile (v4.508/4.514)
- ✅ buildStore pipeline pSales/pLY (v4.522)
- ✅ **Org Summary** `OperatorSummaryPanel` (labor-tools.js) — the one in the screenshots (v4.526)
- ✅ **Rankings** GC vs LY (-100%) (v4.526)
- ✅ **Shared helper `src/engine/vs-ly.js`** (v4.529): `autoFirstDaily` / `matchedVsLY` /
  `autoFirstTotal` — ONE implementation ('sales' | 'gc'), 6 tests. Org Summary + Rankings gcVsLYMap
  migrated to it. **This is the consolidation** (Notes 28 #2). Future vs-LY changes are global.

⏳ REMAINING sweep (per-day ACTUALS auto-first — a deeper slice than vs-LY):
- **District View / store forecast table** (Notes 27 #2): the "Actual/GC/OEPE/TPPH/Labor%/AI-vs-Act"
  columns are empty for the current week's completed days. Source = the `weekDays`/`wk` builder that
  feeds `ForecastTable` (defined `src/views/store-dash.js:604`; called `src/views/store-analytics.js:2185`
  with `weekDays:wk`). Find where each day row's `.actual`/`.actualGC` are set and make them auto-first
  (fall back to DAR `qsrActSummaryRows` sales/gc when manual `laborRows` lacks the recent day). The
  `wk` builder was not quickly located — start there next.
- **Rankings other metrics** (labor%/oepe/tpph/etc.) show "—" on Last Week — these have no auto source
  in `RankingView.localStats` (they read ctrl/ops/laborRows only). GC + sales can be auto-first now;
  labor%/oepe/tpph need DAR/glimpse equivalents wired (bigger — DAR summary lacks oepe/kvst in the
  laborRows shape). Honest "—" for now (not -100%).
- Migrate At-A-Glance salesSec + buildStore pipeline to the shared helper too (currently correct but
  duplicated — finish the consolidation).

## Preview feedback (numbered as owner sent)
1. **Org Summary — no change seen** → ROOT CAUSE above; fixed the actual panel v4.526.
2. **"Spot check store dashboard/store analytics vs-LY — where?"** → open a single Store
   (Store Dashboard / Store Analytics), the header/summary vs-LY figure. (Also uses pipeline
   pSales/pLY — should be better after v4.522; verify.)
3. **Rankings — missing a lot of data** (= Notes 27 #1). GC vs LY -100% fixed v4.526; the OTHER
   metrics on "Last Week / Stores" show "—" because there's no manual data for that window and
   those metrics have no auto source in the ranking recompute yet → needs the auto-first sweep.
4. **VR — "not seeing what changed"** + Visit Patterns placement idea: put Visit Patterns on the
   **Graded Visits panel as a header column relative to all visits by type, filtered by group**
   when a group is selected. (Likely also: VR changes need a hard refresh; and Visit Patterns only
   renders when graded visits are loaded — see #6.)
5. **VR Model Check — aggregate to ALL visits**: learn predictiveness of frequency / day / daypart
   collectively (may not know the location due to sparse visits, but learn WHEN visits happen and
   put stores "on notice"). → district/all-visits aggregate, not per-store recent.
6. **VR — Visit Patterns section not visible at all** (main or expanded). Likely `ds.gradedVisits`
   empty on their device (the section returns null when no visits). Confirm graded-visit data is
   loaded; if it's device-local, this is another auto/cloud-load gap. INVESTIGATE.
7. **Panel Manager — expected ALL panels listed**, with read-only "vital panel" notations (core
   panels shown but locked). → build the CORE_PANELS reference/locked section (my earlier advice).
8. **Profile Menu — add "Load" there too**; remove Load from the main top bar (no need to persist).
9. **Data Manager — extend source labels to the AUTO-SYNCED data** too (denote + describe each).

## Notes 27 (explicit)
- **#1 District Rankings** — GC vs LY, Cash O/S, T-Red After %, OT Hours, R2P, Discount %, OEPE,
  TPPH, KVS Time, DT Parked %, Labor % all show **-100% or —** (view: Stores > Last Week).
  → auto-first sweep (GC fixed v4.526; rest pending).
- **#2 District View** — Store-dashboard tiles → **forecast table not reporting the current week's
  completed-day actuals** (actuals / GC / goal / OEPE / TPPH / labor% / AI-vs-Act) → lots missing.
  Same auto-first gap on the District View forecast table.

## Triage
- 🔴 **Auto-first + matched-day SWEEP** (shared helper) — the meta-fix behind #1/#2/#3 and the
  vs-LY complaints. HIGH priority, do next.
- 🟡 VR refinements: #4 (Visit Patterns → Graded Visits, group-filtered), #5 (Model Check = all-visits
  aggregate + cadence "on notice"), #6 (graded-visit load gap), Notes 26 #7 (no-recent-visit reframe).
- 🟢 Quick: #7 Panel Manager core list, #8 Profile Load button, #9 Data Manager auto-source labels.
