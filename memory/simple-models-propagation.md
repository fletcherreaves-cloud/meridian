---
name: simple-models-propagation
description: How the "Simple" trailing-average model (T3M/T6W/T3W, the Smart-Targets winner) was propagated into the core forecast engine as a first-class, backtest-validated model alongside the engineered ones. Design, leak-safety, re-validation flow, and what was intentionally left alone.
metadata:
  node_type: memory
  type: project
---

# Simple Models across projections (v4.532)

**Why:** the T3M/T6W/T3W simple-trailing family beat every engineered model on store
period totals in the Smart Targets backtest (v4.483). It lived ONLY in Smart Targets.
Owner (Notes 28 #1) asked to propagate it across the projection ecosystem — ripple-aware,
re-validated by backtest, and **without ripping out the engineered models** (standing directive).

## The single insertion point
Every projection stream that matters funnels through **`forecastDay()`** (`src/engine/forecast.js`):
Monthly Projections, Forecast Accuracy, Proj-vs-Actuals, the forecast table, and the Model
Assignment backtest (via `forceModel`). So Simple was added as **one new model code `'simple'`**,
a short-circuit branch beside `ae`/`ewma`. That auto-propagates to all of them. Yearly
Projections is already fed by official targets (which Smart's median-of-simple writes) — no change.

## Day-level definition (the important nuance)
The winning finding was about **monthly totals**, where day-of-week washes out. A daily engine
needs weekday granularity. So `simple` =
- **robust blended trailing DAILY RATE** — `weightedRecencyProjection(series, {asOf, targetDays:1})`
  from `smart-targets.js`, **reused verbatim** (consolidation rule — no re-implementation), which
  blends the anomaly-excluded mean rate over trailing 90/42/21-day windows (weights .2/.3/.5), ×
- **a same-DOW shape** — `robustBaseline(sameDOW)/robustBaseline(allDays)` over the trailing 90d,
  clamped to [0.5, 1.8] so a thin weekend sample can't explode the number.

A full month of these sums back to (trailing daily rate × days) = the exact method that won,
while any single day still respects its weekday. GC uses the same method on the gc series.
Thin history (<14 trailing days) → returns null → **falls through to the engineered `dow`
pipeline** (safety; `modelUsed` reports `dow`, not `simple`, in that case).

## Leak-safety (so a backtest win is credible)
`forecastSimple` anchors to **`sodOf(date)`** — start of the forecast day. `windowRate`
normalizes each row to midnight, so a start-of-day bound cleanly EXCLUDES the target day and
everything after it. Simple never peeks at the day it forecasts — strictly more conservative
than ae/ewma (whose `d < date` noon-vs-midnight compare lets the same day slip in). Locked by a
"poison the same-day actual, forecast must not move" test.

## Re-validation flow (the ripple answer)
`MODELS_TO_TEST` in `src/engine/backtest.js` is now `['dow','ae','ewma','di','simple']`. Re-running
the **Model Assignment backtest** (Labor Tools → Forecast Models/Assign) competes Simple head-to-head
against the engineered models on each store's own held-out daily actuals through the identical
pipeline, and auto-assigns whatever wins per store/horizon. Nothing is auto-changed until that
backtest is re-run. **Forecast Accuracy** (Analytics) gained an always-on `Simple` column + district
tile (forced via `forceModel='simple'`, persisted to `forecast_snapshots` → also visible to SAGE's
`query_forecast_snapshots`), so Simple vs AI vs LY vs DI MAPE is directly comparable regardless of
assignment. Manual per-store override picker gained a **SIMPLE** button.

## Surfaces touched
- `engine/forecast.js` — `forecastSimple` + `_dowShape` helpers; `simple` branch in `forecastDay`;
  imports `weightedRecencyProjection`/`robustBaseline`/`_isNum` from `smart-targets.js`.
- `engine/backtest.js` — `simple` added to `MODELS_TO_TEST`.
- `views/labor-tools.js` — `ML` label (`✨ Simple`), color, override picker button.
- `views/analytics.js` — Forecast Accuracy: `simple` in MODELS, backtest loop, per-store/district
  aggregates, table `vals`, sort chips, district card, CSV export.
- `constants.js` — `MODEL_CODE_LABELS.simple`.
- Tests: `__tests__/forecast.test.js` (positive+tagged, DOW-shape, leak-free).

## Intentionally NOT changed
- DI Calibration + LifeLenz Gap — engineered-model-specific; Simple isn't a DI/WFM concept.
- Yearly Projections — already Smart-fed via official targets.
- Engineered models (Composite/Momentum/Regression/Ensemble in `forecastModels`, and dow/ae/ewma/di)
  — all preserved and fully computable; Simple is additive, never a replacement.

## Rule going forward
Simple gets **assigned** only where it earns it in the backtest. Don't hard-default stores to Simple
without the head-to-head — the whole point is the data picks per store, and the engineered models
stay protected and one click away.
