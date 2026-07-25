---
name: data-sourcing-standard
description: STANDING STANDARD — the single global system for sourcing operating data (auto-first) and computing current-vs-last-year (matched-day). Two shared helpers own this; panels must use them instead of filtering ds.laborRows/ctrlRows/opsRows themselves. Migration status + how to extend.
metadata:
  node_type: memory
  type: project
---

# Data-sourcing standard (global) — auto-first + matched-day

**Why this exists:** the same two computations — "read a metric for a (loc,date)" and
"compare current vs last year" — were re-implemented ad-hoc in many panels, each filtering
`ds.laborRows`/`ctrlRows`/`opsRows` directly. Every copy had the SAME bug (manual-only reads
show blank/"-100%"/"-32%" on recent windows, because recent days live in the auto DAR/Glimpse,
not a manual upload). Owner directive (Notes 28 #2): consolidate to ONE implementation so fixes
are global. These two modules ARE that implementation. **Do not filter raw rows for a metric or
a vs-LY in a panel — call these.**

## The two helpers

### `src/engine/metric-source.js` — per-day metric sourcing (auto-first)
- `METRIC_SOURCES` — registry: for each metric, the ordered source chain (manual first, then
  auto Glimpse/DAR) + `mode` (`'pos'` = >0 is real; `'any'` = 0/negative legitimate).
- `metricDaily(ds, loc, date, key)` — one day's value, first source that has it.
- `metricSeries(ds, loc, range, key)` — `{dateKey: value}` over a range, auto-first per day.
- `metricAvg(ds, locs, range, key)` — mean of the daily values across locs (the standard RATE
  aggregate — means raw daily values, never averages a pre-rolled average).
- Metrics covered: sales, gc, oepe, kvst, park, r2p, laborPct, tpph, otHrs, cashOSPct, tRedAPct,
  discPct. **Add a metric = add one line to `METRIC_SOURCES`.**

### `src/engine/vs-ly.js` — current-vs-last-year (matched-day)
- `autoFirstDaily(ds, loc, range, kind)` / `matchedVsLY(ds, locs, range, kind)` /
  `autoFirstTotal(ds, loc, range, kind)`. `kind` = `'sales' | 'gc'`.
- Matched-day: a day counts on both sides only when it has data this year AND a comparable LY
  value. Auto-first current from manual, else DAR. Use for ANY vs-LY figure.

Both cache lazy per-source indices non-enumerably on `ds` (rebuild automatically when `ds` is
replaced). Both have test suites (`__tests__/metric-source.test.js`, `__tests__/vs-ly.test.js`).

## Migration status (v4.531)
**Migrated (use the helpers):**
- vs-LY: At-A-Glance sales tile, buildStore pipeline, **Org Summary** (OperatorSummaryPanel),
  **Rankings** GC — via `vs-ly.js`.
- metrics: **forecastDay** (oepe/tpph/labor per day), **RankingView.localStats** (all rate
  metrics), **OperatorSummaryPanel** (laborPct/tpph/oepe/cashOS) — via `metric-source.js`.
- **forecast table Actual/GC** — auto-first from DAR (`forecast.js:_qsrActIdx`).

**Intentionally NOT migrated (wrong shape for the simple resolver — leave as-is):**
- `LaborAnalyticsPanel` (labor-tools.js) — labor-HOURS-centric; drops stores with no manual
  labor/ctrl rows by design (needs actual punched hours). Rates could be migrated but the panel's
  hours/period-summary logic makes it risky; revisit only if it becomes a reported gap.
- `store-analytics.js` `dowData` — a day-of-WEEK breakdown (per-DOW means), not a range mean;
  metricAvg would change its semantics.
- Visit Readiness engine (`visit-readiness.js`) already has its own per-metric `srcs` chains
  (incl. glimpse) — a parallel-but-correct system; fold into METRIC_SOURCES later if convenient.

**Remaining candidates (migrate opportunistically when touching them):** morning-brief peaks
metrics; any new panel — must use the helpers from day one.

## Rules going forward
1. **Never** filter `ds.laborRows`/`ctrlRows`/`opsRows` for a metric value in a panel — call
   `metricDaily`/`metricAvg`.
2. **Never** hand-roll a current-vs-LY — call `matchedVsLY`.
3. Adding an auto source for a metric (e.g. wiring a new stream) = edit `METRIC_SOURCES` once;
   every consumer benefits.
