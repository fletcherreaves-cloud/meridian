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
- **STATUS (Claude):** ✅ **DONE (v4.532).** Simple is now a first-class forecast model
  (`'simple'`) inside the single `forecastDay` engine, so it propagates automatically to every
  stream that routes through it: Monthly Projections, Forecast Accuracy, Proj-vs-Actuals, and the
  forecast table. Day-level definition = the robust trailing daily rate (`weightedRecencyProjection`,
  **reused verbatim from smart-targets.js** — no copy) × a same-DOW shape, strictly pre-`asOf`
  (leak-free). Added to `MODELS_TO_TEST` so the Model Assignment backtest **competes + re-validates**
  Simple vs DOW/AE/EWMA/DI per store/horizon; Forecast Accuracy gained a Simple column + district
  tile; manual per-store override picker gained a SIMPLE button. Yearly Projections already Smart-fed
  (no change). Engineered models preserved intact (standing directive). Tests in `forecast.test.js`
  (positive/tagged, DOW-shape, leak-free). See `memory/simple-models-propagation.md`.
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
- ✅ **DONE (v4.533).** `weatherRows` (tmax/tmin/davg/rain/wspd) is now a `weather` metric group in
  `signal-registry.js` → auto-appears in the Scanner + Signal Lab (both are registry-driven).
  Rainfall carries `allowZero` (dry days kept — else only rainy days correlate). Temps concept-
  grouped (`temp`) so high/low/avg don't tautologically pair. Seeds: High Temp→Sales, Rainfall→GC.

## 4. Signals — common-sense day-of-week logic in correlations
- ✅ **DONE (v4.533).** New `calendar` metric group — synthetic 0/1 flags per (loc,date):
  `calWeekend`, `calFri`, `calMon`. Source `'__calendar'` → `extractMetricValues` special-cases it,
  generating values over the union of days in the real daily streams (`_calendarUniverse`), so they
  intersect cleanly with any metric. Daily-only (a monthly weekend-fraction is ~constant). Scanner
  guards calendar×calendar pairs. Seeds: Weekend→Sales, Friday→Sales (Friday = the Filet-O-Fish
  anchor for #5). Point-biserial r reads as the day's lift. Tests in `signal-scanner.test.js`.

## 5. Product-mix correlations (future, needs Product Mix pull — Notes 25 #1)
- Fun fact / test case: **Filet-O-Fish sells more on Fridays and around Easter.** Once product-mix
  data is pulled, this should be an easy, validating correlation (day-of-week + holiday × product).

## Triage
- 🔴 Active: the **auto-first/matched-day sweep + shared helper** (#2's first instance) — in progress.
- 🔷 Big: #1 Simple Models across projection streams (+ re-backtest/forward-test) — own workstream, ripple-aware.
- 🟡 Signals: #3 weather, #4 day-of-week correlations.
- 🔵 Future: #5 product-mix correlations (after Product Mix pull, Notes 25 #1).
