# Dispatch22, Workstream A — forecast-week precompute, full trace

2026-08-19. `memory/plan-normalization-2026-08-17.md`'s Workstream A: move
`weekProjections`'s 189 `forecastDay()` calls (27 stores x 7 days) off At A
Glance's render path — measured 76,503 ms of 82,221 ms render time (93%), up
to 4.3s to close a modal.

## What ships in this PR

- `supabase/schema-forecast-week-cache.sql` — **owner must run this migration**
  before the precompute job can write anything. Standard tenant_id + RLS +
  `set_tenant_id()` trigger pattern, mirroring `qsr_daily_activity_rollup`.
- `scripts/forecast-week-precompute.mjs` — new scheduled script, runs
  `forecastDay()` for the current week, all 27 stores, once a day.
- `.github/workflows/forecast-week-precompute.yml` — new Action, daily
  11:00 UTC (~6am CDT). Registered in `sync-failure-watch.yml`.
- `src/engine/labor-supplement.js` — `supplementLaborWithSched` extracted out
  of `App.js` (pure move, no behavior change) so the precompute script imports
  the exact same function the browser uses, instead of a hand copy.
- `src/engine/forecast.js` — new exported `fetchRecentActual(ds, loc, date)`,
  extracted from the `_aeAct`/`_ewmaAct`/`_sAct` inline IIFEs that existed
  three times inside `forecastDay` already. Lets a cache-hit day get a
  live-fresh "actual" without re-running the whole forecast.
- `src/lib/supabase.js` — new `loadForecastWeekCache()`.
- `src/app/App.js` — wires it into `ds.forecastWeekCache` at startup (T2 tier).
- `src/views/at-a-glance.js` — `weekProjections` now checks, per store, whether
  the cache covers every day of the current week; if so it skips that store's
  7 `forecastDay()` calls and reads the cache instead. Partial/missing cache
  falls back to the exact live computation, unconditionally, per store — never
  a mixed cached+live week, never a blank panel.

## Why `forecastDay()` itself was safe not to touch

Traced every field `weekProjections` actually reads off `forecastDay`'s return
object: `forecast`, `actual`, `lyAdj`. Every other field (`oepe`/`tpph`/
`labor`/`t2`/`t4`/`t6`/`varPct`/`pass`/`goal`/...) is computed and then
discarded by this one caller.

Then traced what THOSE three fields depend on, for the model each real store
is actually assigned at the weekly horizon. **Correction to the plan's own
premise, found by checking rather than trusting the comment**:
`src/engine/forecast.js`'s comments claim "all 27 stores are assigned model
'ae'" (referring to `DEFAULT_MODEL_ASSIGNMENTS`) — true of the *default*, but
the real cloud-persisted `user_settings.model_assignments` override blob
(confirmed live via the precompute script's own dry run, 2026-08-19) actually
assigns a MIX: `ae`, `ewma`, `di`, and `simple` across the 27 stores. All four
of those branches' actual/forecast/ly computation depends only on
`ds.laborRows`/`laborIdx`/`laborByLoc` and `ds.qsrActSummaryRows` (via
`forecastDay`'s internal `_qsrActIdx` cache) — not `ds.opsRows`/`ctrlRows`/
`weatherRows`/`peaksRows`, which only feed the fields `weekProjections`
discards. That's what let this precompute job's data-loading surface stay
small instead of replicating App.js's full ~30-source `ds` construction.

`ds.targets` was checked too: it's `{}` in production today — no code path
ever populates it beyond the empty initializer `buildDS` sets. `DEFAULT_TARGETS`
(a static import from `constants.js`) is the real live source; the precompute
script uses it directly.

## The model-assignment shim

`forecastDay`'s own internal `getModelAssignment()` reads a per-store override
blob from `localStorage` in the browser (cloud-mirrored to `user_settings`,
key `model_assignments` — see `labor-tools.js`'s `_pushModelAssignments`).
Node has no `localStorage`. The precompute script fetches that same row
(single-tenant assumption: grabs the most-recently-updated row for that key,
flagged in the script's own comment for whoever adds a second real user) and
shims a minimal `globalThis.localStorage` before calling `forecastDay`, so its
UNMODIFIED internal lookup sees the same data the browser would. Verified this
was necessary, not theoretical: the real override blob genuinely differs from
`DEFAULT_MODEL_ASSIGNMENTS` (see above).

## Verified against real data before shipping

Ran the full script against live Supabase data (`.env.local` credentials,
this session, 2026-08-19): loaded 9,811 `labor_rows` + 1,620
`qsr_daily_activity_rollup` rows, computed all 189 store/day forecasts, all
sane dollar figures ($5k-$23k/day range, matching known store volumes),
correctly split across the 4 real model types. It failed only at the final
upsert step with "relation `forecast_week_cache` does not exist" — exactly the
expected failure, since the SQL migration hasn't been run yet. This is strong
evidence the whole data-loading + `forecastDay` execution path is correct
under Node with real production data, not just plausible-looking synthetic
fixtures.

## What was NOT verified — say so explicitly

**No live before/after render-time click-trace.** This environment has no
browser session / login to the deployed app, so the `_mark('compute:
weekProjections', ...)` instrumentation the plan asked for could not be
captured here. The architectural argument (a cache-hit store skips all 7
`forecastDay()` calls entirely, down to a plain lookup) is sound and the tests
prove the wiring is real (render the actual panel, assert the cached number
appears — not just an engine-level assertion), but the actual before/after
millisecond numbers should be captured by the owner once this deploys, using
the same click-trace the plan's original measurement came from.

## Known edge case, not fixed here

The precompute job computes "the current week" using the GitHub Actions
runner's system clock (UTC); the client computes it using the browser's local
time (likely US Central, per every other cron comment in this repo). Near a
week boundary (Wednesday, `weekStartDay:3`) and only within the few hours
where UTC and Central disagree on the calendar date, the job could compute a
different 7-day window than the client for that one day. The daily cron is
scheduled for 11:00 UTC (~6am CDT), when both agree, so this is unlikely to
bite on the normal schedule — but a manual `workflow_dispatch` at an unusual
hour could. Impact is bounded to a graceful degrade (that store's week reads
as a partial/no cache-hit that day and falls back to live), not a wrong
number — flagged here rather than silently assumed safe.

## Design decision: a new table, not `forecast_snapshots`

Considered and rejected extending `forecast_snapshots`
(`supabase/schema.sql:917`, PK `loc,dt,source`, written by
`ForecastAccuracyPanel.runBacktest`, read by SAGE's
`query_forecast_snapshots` tool). It has no LY column and a different grain
(one row per model-source per day, a backtest/accuracy record — not the
weekly-rollup shape `weekProjections` builds). Extending it risked two
different writers under one schema, and SAGE's tool seeing rows it wasn't
built to expect. A dedicated `forecast_week_cache` table keeps both readers
correct without either needing to change.
