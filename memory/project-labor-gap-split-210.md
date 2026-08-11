# Labor gap, split two ways (#210)

**Shipped:** v4.989, 2026-08-11. Second of Push 3 (#209 → #210 → #208) — the diagnose leg:
names *which of two people* to coach, from data already pulled.

## The insight

`qsr_daily_activity` has always carried `total_needed_hours`, `total_scheduled_hours`, and
`actual_punched_hours`, hourly. Meridian only ever showed the combined actual-vs-needed gap
(`actVsNeed`). Splitting it aims two different coaching conversations at two different people:

```
Needed → Scheduled  =  PLANNING ACCURACY  →  coach the scheduler / the forecast
Scheduled → Actual  =  EXECUTION          →  coach the shift manager
```

## The gap this issue's framing undersold

The issue said this "needs no new data" — true of the raw hourly table, but a measured
correction: **`loadQsrActSummary` never carried `total_scheduled_hours` through, on either read
path.**

- The hourly-fallback `SELECT` (`src/lib/supabase.js`) omitted `total_scheduled_hours` even
  though the column has always existed in `qsr_daily_activity` (confirmed already selected
  elsewhere — `loadVisitDAR`, `loadDailyActivity`).
- `qsr_daily_activity_rollup` — the table `loadQsrActSummary` actually reads in production
  (preferred over the ~40-page hourly pagination) — never summed `total_scheduled_hours` into
  its per-(loc,dt) row at all. `refreshRollup()` (`scripts/qsrsoft-dar-pull.mjs`) only summed
  `actual_punched_hours` and `total_needed_hours`.

So today, before this issue, `loadQsrActSummary`'s output carried needed and actual hours but
never scheduled — the split was genuinely impossible from the data Meridian was reading, even
though the upstream table had it. Verified by grep, not assumed, matching the standing
"measure it" discipline.

## Fix

1. **Hourly-fallback path**: added `total_scheduled_hours` to the `SELECT`, added `darSchedHrs`
   to the per-(loc,dt) accumulator, `+=` each row's value with an ordinary `|| 0` — the raw
   table always has this column, so a missing per-row value is normal noise, not a schema gap.
2. **Rollup path** (`_qsrActFromSummed`): added `darSchedHrs: v.total_scheduled_hours ?? null`.
   `??` not `||` — deliberately. The rollup table doesn't have this column until the owner runs
   the new migration (below), so `v.total_scheduled_hours` is `undefined` today; collapsing that
   to `0` would show every store wildly "under-scheduled." `null` propagates "unknown" honestly,
   exactly the `dt_heldtime` rollout's precedent (#183).
3. **New migration**: `supabase/schema-qsr-rollup-scheduled-hours.sql` — `ALTER TABLE ... ADD
   COLUMN IF NOT EXISTS total_scheduled_hours float`, matching the `dt_heldtime` ALTER's exact
   convention (the rollup table's `CREATE TABLE` itself isn't checked in). **Owner needs to run
   this against the live project.**
4. **`refreshRollup()`** (`scripts/qsrsoft-dar-pull.mjs`) now sums `total_scheduled_hours` too.
   Safe to ship ahead of the migration: a column-not-found error fails the whole upsert, but
   that failure is caught and logged as non-fatal — the hourly rows are already saved regardless
   — the exact same non-fatal-upsert pattern `dt_heldtime` already established. Once the owner
   runs the SQL, the next scheduled pull starts populating the column automatically.

## Engine: `src/engine/labor-gap-split.js`

Deliberately bypasses `metric-source.js`'s scalar-with-fallback resolver model — this is a
correlated TRIPLET (needed/scheduled/actual must all come from the same rows to stay internally
consistent), not an independent per-metric value. Same reasoning `waste-discipline.js` (#209)
used for a different shape of problem.

- `computeLaborGapSplit(rows, {asOf})` — buckets `ds.qsrActSummaryRows`-shaped rows
  (`{loc, date, needHrs, actHrs, darSchedHrs}`) by store × Wed-Tue pay week, excluding any day
  after the last CLOSED business day *before* bucketing (signature #4 — an in-progress day must
  not leak in, even when it's the literal last day of its own pay week — the Aug 11 2026 test
  fixture is deliberately that exact edge case, a Tuesday that's also the final day of its pay
  week). Returns per-week `{needHrs, actHrs, schedHrs, planningGapHrs, executionGapHrs,
  combinedGapHrs, complete}`. A week containing any row with `darSchedHrs == null` reports
  `schedHrs`/`planningGapHrs`/`executionGapHrs` as `null` — `combinedGapHrs` (actual−needed) is
  unaffected since both those inputs have always been carried.
- `latestCompleteWeekByStore(splits)` — the coaching-ready figure, never an in-progress week
  whose number is still moving.
- `laborGapSplitSummary(weekRows)` — district rollup, mirrors `count-cycle.js`'s `cycleSummary`
  / `waste-discipline.js`'s `disciplineSummary` shape; only averages stores with known scheduled
  data into the planning/execution totals (`combinedGapHrs` totals every store, since it's
  always known).

## Why Wed–Tue, explicitly

The owner: *"Leave the Wed start day of week everywhere in the app."* His Mon–Sun preference is
scoped to inventory count views only (`memory/project-inventory-control-redesign.md` §5). Labor
hours are **paid** Wed–Tue — mixing a Mon–Sun window with Wed–Tue hours "produces a labor %
that is wrong and does not look wrong," the issue's own words. `PAY_WEEK_START = 3` is passed
explicitly to `weekStartOf`/`weekKeyOf` rather than relying on their module-level default
(also 3 today) so a future settings change elsewhere can't silently change what this file means.

## UI: Labor Tools → Labor Analytics → 🎯 Planning/Execution tab

New tab in `LaborAnalyticsPanel` (`src/views/labor-tools.js`, lazy-loaded — zero entry-chunk
cost). Independent of the panel's own flexible period selector (2wk/4wk/MTD/etc.) — the split
is inherently a pay-week construct, not a trailing-window one. Per-store: Needed / Scheduled /
Actual / Planning Gap / Execution Gap / Combined / **Coach** (Scheduler / Shift Manager / On
plan).

The "On plan" gate reuses the panel's own already-shipped `avCol` combined-gap banding
(30/60 hrs — the same threshold the Overview and 6-Wk Trend tabs already grade Act-vs-Need
against) rather than inventing a new unmeasured cutoff for the split specifically. When both
gaps are outside that band, attribution goes to whichever half has the larger magnitude.

A visible amber banner — not a silently-blank column — explains the missing migration when
`storesWithSchedData === 0` (which is every store, today, until the owner runs the SQL).

## Deliberately deferred, not built here

- **§4.2 rate/hours/sales decomposition** — needs `actual_punched_dollars` (confirmed present
  in `qsr_daily_activity`, e.g. selected by `loadVisitDAR`) threaded through both loader paths
  plus its own rollup-table migration, the same shape of work as this issue, not a quick
  addition on top of it. A genuine follow-up, not squeezed in here.
- **§4.3 intraday heat map** — the issue's own instruction: drop it rather than squeeze it in
  if bundle headroom is tight. `src/views/signals.js`'s `HourlyDetail` (Live Ops tab) already
  computes the identical per-hour gap-vs-need / gap-vs-sched math for *today's single day* —
  worth generalizing into a per-store hour×DOW grid rather than rebuilding, when this is picked
  up.

## Verification

8 new tests (`src/__tests__/labor-gap-split.test.js`): pay-week bucketing, the split arithmetic
against a hand-computed example, the in-progress-day exclusion (using the Aug-11-is-a-Tuesday
edge case above), complete-vs-current-week detection, the null-vs-fabricated-zero distinction,
multi-store/multi-week bucketing, and the district summary rollup.

Full suite (1284 tests) + build both pass clean. Entry chunk 812.21 KB → 813.78 KB gzip
(+1.57 KB — this changelog text plus the new supabase.js/dar-pull.mjs code, both in the entry
chunk; `labor-tools.js` is lazy, so the new tab's own markup landed entirely in its own chunk:
26.42 KB → 27.85 KB gzip). 36.22 KB headroom remains.

**Not verified against live data** — no authenticated Supabase session in this sandbox. The
migration needs to actually run against the live project, and a subsequent DAR pull needs to
backfill at least one full pay week, before the split UI shows anything but "—" in production.
