---
name: notes-28-queue
description: Owner "Notes 28" (2026-07-24). Projections/Simple-Models status check (post the T3M/T6W/T3W accuracy discovery), a STANDING RULE to hunt+consolidate duplicated computations, weather + day-of-week + product-mix correlations in Signals.
metadata:
  node_type: memory
  type: project
---

# Notes 28 (owner, 2026-07-24)

## 1. 🔷 Projections / forecasting — where are we post "Simple Models" discovery?
- Owner: the T3M/T6W/T3W simple-trailing family beating every engineered model (v4.483) was a
  **huge finding**. Did we propagate it beyond Smart Targets?
- **STATUS (Claude):** Simple Models are the DEFAULT only in **Smart Targets** (median-of-simple).
  The broader projection ecosystem (Monthly/Yearly Projections, Forecast Models/Assign, DI
  Calibration, Forecast Accuracy, LifeLenz Gap, Proj-vs-Actuals) still runs the engineered
  models. → **Not yet propagated.** This is Notes 26 #6 ("Simple Models across all projection
  streams") — a real workstream.
- ⚠️ **Ripple warning (owner):** changing the projection model cascades through Model
  comparisons, accuracy tests, calibration tests, Proj-vs-Actuals, etc. Must **re-run backtests +
  forward tests** to re-validate the theory before/after. Plan the change + the re-validation
  together. Protect the engineered models (standing directive) — add Simple as a first-class
  option, don't rip out.

## 2. ⭐ STANDING RULE — hunt & consolidate duplicated computations
- As we find the SAME computation implemented in different code (different panels), **note it,
  keep a running list, and plan a course to consolidate to ONE shared implementation** so future
  changes are global.
- **Already living proof:** the vs-LY / matched-day logic was reimplemented in ≥4 places (At-A-Glance
  tile, buildStore pipeline, Org Summary OperatorSummaryPanel, Rankings gcVsLYMap) — each had the
  same coverage bug and had to be fixed separately. → build a shared `matchedVsLY` /
  `autoFirstDaily` util and migrate all call sites. THIS IS THE ACTIVE "auto-first sweep."
- Running duplicate-logic list (start here; append as found):
  - vs-LY / matched-day (multiple) → consolidating now.
  - "auto-first daily sales/GC" (manual laborRows vs DAR qsrActSummary) → same helper.
  - per-store rate aggregation (row-mean) appears in RankingView.localStats, OperatorSummaryPanel,
    labor-analytics — candidate to share.
  - (append…)

## 3. Signals — add WEATHER to correlations
- `ds.weatherRows` (Open-Meteo, auto) exists but isn't in the Signals correlation Scanner. Add it
  as a metric source so weather↔sales/traffic correlations surface. Value-add.

## 4. Signals — common-sense day-of-week logic in correlations
- Add day-of-week (and similar calendar) factors to correlations, not just raw metric pairs.

## 5. Product-mix correlations (future, needs Product Mix pull — Notes 25 #1)
- Fun fact / test case: **Filet-O-Fish sells more on Fridays and around Easter.** Once product-mix
  data is pulled, this should be an easy, validating correlation (day-of-week + holiday × product).

## Triage
- 🔴 Active: the **auto-first/matched-day sweep + shared helper** (#2's first instance) — in progress.
- 🔷 Big: #1 Simple Models across projection streams (+ re-backtest/forward-test) — own workstream, ripple-aware.
- 🟡 Signals: #3 weather, #4 day-of-week correlations.
- 🔵 Future: #5 product-mix correlations (after Product Mix pull, Notes 25 #1).
