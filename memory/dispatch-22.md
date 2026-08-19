# Dispatch #22 — Workstream A: move the week's forecast off the render path

**Board (2026-08-18, late):** `main` at v5.063 (`7044e6f`). PR #414 (dispatch21's regression test)
reviewed and merged this session — one correction made before merge: its body claimed "4359/4359
tests pass," the real CI-verified count is **1523/1523** (140 files). Fixed in the changelog entry
before merging so the wrong number didn't ship into the permanent record. Nothing else outstanding
in the PR queue.

**The normalization plan's sequencing gate is now clear.** `memory/plan-normalization-2026-08-17.md`
blocked all seven workstreams on two things: Phase 0's ratchets (R1/R3/R4/R6) and the open PR queue
(#373, #374, #376, #377, the calendar fix #391, #392). All confirmed merged on `main` — verified via
`git log`, not assumed. This is the first workstream dispatch since the plan landed.

---

## The task: Workstream A, exactly as scoped in the plan

Read `memory/plan-normalization-2026-08-17.md`'s "Workstream A" section first — this dispatch adds
code-location grounding on top of it, not a replacement for it.

**The problem, measured (already in the plan, re-stated so it's in one place):** `weekProjections`
in `src/views/at-a-glance.js` = 76,503 ms of 82,221 ms of render time (93%), from 189 `forecastDay`
calls per run (27 stores × 7 days), across 14 runs. Every other instrumented span combined is under
1.6 s. Closing a modal costs up to 4.3 s because of it.

**Exact call site:** `src/views/at-a-glance.js:1519-1560` — the `weekProjections` `React.useMemo`.
It already carries the `_mark('compute:weekProjections', …)` click-trace instrumentation (line 1519)
that produced the numbers above — re-use it for your own before/after measurement rather than
re-instrumenting. Loop body at line 1548: `const r=forecastDay(loc,d,ds,cfg,null,t);`.

**Standard:** precompute where the data lives; the client fetches an answer, not inputs.
**`forecastDay` (src/engine/forecast.js:1441) does not change.** It becomes the job's engine
instead of the render path's — zero forecasting-logic change is what makes this safe to ship.

## Prior art in this repo — the closest existing pattern, and where it doesn't fit

The plan says "the pattern already exists here twice." I checked both before writing this:

1. **`qsr_daily_activity_rollup`** — the real, working version of "precompute where the data
   lives." `scripts/qsrsoft-dar-pull.mjs:202-247` (`refreshRollup`) aggregates the hourly rows it
   just pulled into a per-`(loc,dt)` summary and upserts it in the same script run
   (`onConflict:'loc,dt'`), so the client reads ~1,650 pre-aggregated rows instead of paging
   ~40,000. **This is the shape to copy: aggregate once at write time, read cheap at render time.**
   The difference for forecasts: DAR has an upstream pull to piggyback the refresh on; a forecast
   doesn't — it has to be its own scheduled job (new GitHub Action), not a step tacked onto an
   existing pull.

2. **`forecast_snapshots`** (`supabase/schema.sql:917-938`) — exists, but **check its actual shape
   before assuming it's the target.** It's a backtest/accuracy record: PK `(loc, dt, source)`,
   columns `forecast_sales`, `actual_sales`, `mape`, written by `ForecastAccuracyPanel.runBacktest`
   and read by SAGE's `query_forecast_snapshots` tool. It has **no column for last-year sales**, and
   its grain is one row per store-day-source, not the per-store weekly rollup shape
   `weekProjections` currently builds (`storeProjs` → `wkTotal`/`lyTotal`/`actualTotal`/`vsLY`/
   `rowDays`). Extending this table to also serve At A Glance, vs. adding a new table for the
   weekly-rollup shape, is a real design call — **make it and say why in the PR**, don't let it
   default silently. Whichever way you go, don't disturb what SAGE and the accuracy panel already
   read from it.

**On `vsLY`:** the client already loads `ds.qsrActSummaryRows` (used at line 1538-1543 today to
patch in cloud actuals when manual `laborRows` are blank). If the new precompute source doesn't
carry last-year sales, the client can likely keep deriving `vsLY` from `qsrActSummaryRows` it
already has in memory rather than making the cache table carry it too — worth checking before
adding a column.

## ⚠️ Interaction warning — read before touching the calendar

Production currently runs `weekProjections` against **733** event entries because the (already-
merged) calendar-event-loss fix's predecessor bug discarded most of them. Once Workstream B
(event scope+recurrence) ships, this same computation processes **~11,000** — fifteen times more
per run. If Workstream B ships before this migration, the app gets *slower*, not faster. **This
workstream must land first, or the two must be measured together.** Do not start Workstream B
until this is done or you've deliberately decided to measure them as one change.

## Tracks

**#386**, **#369**, **#261** (this workstream re-scopes #261 — the panel redesign is *not* the gate
on the performance fix, ship the precompute without waiting on any UI rework), **#256**.

## What NOT to do

- Don't change `forecastDay`'s forecasting logic. This is a data-flow migration, not a model change.
- Don't wait on Workstream B, D, E, F, or G — A is first in the recommended order specifically so
  nothing downstream inherits its cost twice.
- Don't fold in the #261 redesign. Ship the perf fix on its own; the redesign can follow.

## Before you open the PR

- Re-measure with the existing click-trace (`_mark('compute:weekProjections', …)`) and put both
  before/after numbers in the commit body — this project's standing performance-budget rule.
- If this needs a new/altered Supabase table or a new scheduled Action, say so explicitly in the PR
  — new migrations need the owner to run them, and a new Action needs to be added to
  `sync-failure-watch.yml`'s watch list per CLAUDE.md's "adding a new automated pull" standing rule
  (this isn't a data *pull*, but it's the same silent-failure risk if nothing watches it).
- Spot-check your own claims before writing the PR body — this session corrected a wrong test count
  in the *previous* dispatch's PR before merging it; the same discipline applies going forward.
