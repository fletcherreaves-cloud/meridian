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

## v4.534 — Period-Total Scoreboard (re-validation on the discovery metric)
Owner asked (2026-07-25): "did we alter Simple when merging it engine-wide, and if so were the
alterations safe? It doesn't look like the across-the-board wins we saw at discovery."

**Answer / what we confirmed:**
- Core math **unaltered** — `forecastSimple` reuses `weightedRecencyProjection` verbatim (same
  90/42/21-day windows, .2/.3/.5 recency weights, anomaly exclusion).
- **One addition:** a same-DOW shape multiplier (`_dowShape`, clamped [0.5,1.8], leak-free). It is
  *required* to forecast a single day (the discovery averaged DOW away over a month). Conservative:
  a month of daily-Simple forecasts sums back to trailing-rate × days = the winning monthly total.
- **Why the wins look muted:** the discovery (`backtestProjectors`) graded **28-day period TOTALS**;
  the Model-Assignment backtest + Forecast-Accuracy panel grade **daily MAPE**. Different tests —
  daily rewards exact DOW placement + absorbs no day-level noise (the engineered models' home turf);
  totals let day errors cancel (Simple's home turf). Not a regression, a different metric.

**Shipped:** `runPeriodTotalBacktest(ds, settings, userEvents, onProgress, {periodDays:28, folds:6,
minCoverageFrac:0.6, cancelRef})` in `engine/backtest.js` — **read-only** (writes NO assignments).
Rolls contiguous 28-day windows per store, sums each model's leak-free daily forecasts over the
window's data-covered days, MAPE vs the actual total for the same days. Runs in **Back Test mode** so
engineered models are ex-ante too (Simple is already strictly asOf=window start). Returns per-store
winner + `winnerCounts` tally + `medianSimpleMape` / `medianBestEngMape`. UI: Model Assignment panel →
**📊 Period-Total Scoreboard** overlay (`PeriodTotalScoreboard` in `views/labor-tools.js`), verdict
banner ("Simple sweeps" when it wins ≥60% of scored stores). Tests in `__tests__/backtest.test.js`.

**Interpreting it:** if Simple sweeps here → discovery re-validated at the level it was found, and the
daily panels are simply a harder/different question. If it does NOT sweep here → genuine signal that
the period-total edge has narrowed; investigate before leaning further on Simple for monthly locks.

## v4.536 — Scoreboard verdict + a real bug it flagged (2026-07-25)
Ran the Period-Total Scoreboard on production data. Result: **"Mixed — Simple does
not dominate period totals. Simple won 0/27; median Simple 4.5% vs best-engineered
2.7%."** Winner tally: **AE 23, EWMA 4, Simple 0, DOW 0, DI 0.**

**Reconciliation (nothing regressed):**
- Simple ≈ 4.5% median — *matches the v4.483 discovery's ~5%*. Simple is stable.
- DOW ≈ 11% median — this IS the discovery's "engineered 8–14%". Simple beats it,
  exactly as found. The discovery's bake-off (`backtestProjectors`) only compared
  Simple vs the **projector family** (Composite/Momentum/Regression/Ensemble/DOW).
- **AE (Adaptive Ensemble) ≈ 2.9% median — was NEVER in that bake-off.** The
  Scoreboard is the first Simple-vs-AE head-to-head on totals, and **AE wins.**
- Daily vs total, per store (Ada): Simple **4.1% daily** but 2.9% total; AE **8.2%
  daily** but **2.3% total**. AE's day errors are large but *unbiased → cancel over
  28 days*; Simple's are small but *biased → accumulate*. So the **daily**
  Model-Assignment backtest picks Simple; the **totals** metric (what monthly
  targets care about) picks AE. The daily backtest was steering us wrong for
  monthly targets — which is exactly why the Scoreboard exists.
- **AE leak check:** forecastAdaptiveEnsemble's signals (EWMA/LY/momentum/seasonal,
  ~85%+) all strictly filter `d<date`; forecastAdaptiveDI too. Only asterisk: AE's
  DI blend params (`mf_ae_params`) are grid-fit on full history — a ~13%-weight
  in-sample edge, too small to explain the 1.6pt gap. AE's win holds. (Can re-run
  with fixed default params to make it ironclad.)

**Open decision (do NOT change silently):** for MONTHLY SALES targets, AE looks
better than median-of-Simple. Smart Targets currently recommends median-of-Simple.
Pending owner sign-off before shifting the Smart-Targets monthly-sales default
toward AE. Engineered models were always preserved, so this is additive.

## v4.536 — BUG FIXED: backtest results ignored until reload
`runModelAssignmentBacktest` ended with `_masgnCache=merged`, but `_masgnCache` is
module-private to forecast.js and **not imported** into backtest.js → in an ES
module that assignment throws a ReferenceError the `try/catch` swallowed. Net
effect: the daily backtest wrote winners to localStorage and showed the "65 →
SIMPLE" change list, but `getModelAssignment` kept serving **stale/DEFAULT**
assignments (table + every live forecast showed AE) until a full page reload.
Fix: import and call the exported `_masgnInvalidate()` after the write. Regression
test in `__tests__/model-assignment-cache.test.js`.

## v4.539 — AE wired to Monthly/Yearly locks (the totals decision, owner-approved)
Strict Scoreboard re-run (AE on static params) confirmed the verdict unchanged: AE
wins 23/27 on 28-day totals, median AE 2.7% vs Simple 4.5%. Owner green-lit acting.
Implemented `applyPeriodTotalWinners(result, {horizons:['monthly','yearly']})` in
backtest.js + a "📌 Apply to Monthly + Yearly locks" button on the Period-Total
Scoreboard. It writes the per-store totals-winner into the Monthly + Yearly model
assignments (so the monthly/yearly projections, which route through
getModelAssignment(loc,horizon), use the totals-optimal model — mostly AE, EWMA on
a few). Preserves manual overrides; overwrites prior daily-backtest auto entries;
**leaves Weekly alone** (daily accuracy is right for the ~10-day lock). Invalidates
the assignment cache so it takes effect immediately. Reversible: re-run the daily
backtest. NOT automatic — explicit owner action, transparent ref string
("📊 Period-total <date>: AE 2.3% (6×28d totals)"). Simple stays a first-class
model and still wins daily for several stores. Tests in
`__tests__/model-assignment-cache.test.js`.
