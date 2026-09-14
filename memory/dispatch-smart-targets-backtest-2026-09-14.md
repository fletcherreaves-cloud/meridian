# Smart Targets: year-to-date backtest engine (2026-09-14)

Owner request: *"we need to build a backtest engine for all the smart targets to see
how we've performed over this year vs actuals as well as loaded targets from me."*

## Design decision: reuse the live primitives, don't re-implement

The live Smart Targets view's `model` useMemo computes, per store, "what should the
target be right now" using `weightedRecencyLevel`/`weightedLevel`/`peerAnchor`/
`blend` (ratio metrics) or `medianProject` (the sales metric). A backtest needs the
exact same question asked at a PAST point in time. Two ways to get there:

1. Refactor the live view's inline computation into a reusable function, parameterized
   by `asOf`, and have both the live view and the backtest call it.
2. Write a new orchestration that calls the SAME low-level primitives directly with
   historical inputs, without touching the live view's own code path at all.

Chose (2). CLAUDE.md's own standing rule — *"when two panels disagree on one number,
diff the two computations"* (dispatch16, from a real incident, #348) — exists because
a SEPARATE historical computation can silently drift from the live one over time if
they don't share their actual math. Calling the identical primitive functions
(not just producing the same-shaped answer) is what closes that gap, while (1) risked
regressing a live, already-shipped, heavily-tested feature for a lower payoff. This
mirrors how `backtestProjectors` already works for the panel's own "Best fit"
scoreboard — a separate orchestration walking held-out periods, built on the same
projector functions the live Smart column uses.

## `runMonthlyBacktest(ds, metric, seriesByLoc, months)`

Pure, exported (`src/views/smart-targets.js`). For each `{y, m}` in `months`
(oldest first) and each store in `seriesByLoc`:

- **Learning window**: entries strictly before `monthStart`, within `windowDays`
  (default 90) — same cutoff logic the live view uses, just anchored to the
  historical month instead of "now."
- **Peers**: every store WITH learning data for that month (not just the ones
  with a current-month actual) gets a baseline/volume, so peer-anchoring works
  the same way it does live.
- **Smart**: ratio metrics → `weightedRecencyLevel(dailyW, {asOf: monthStart})`
  blended toward the peer anchor via `blend()`; the sales metric → `medianProject`
  (the same T3M/T6W/T3W-median-of-simple family), falling back to
  `computeSmartTarget` if `medianProject` can't compute.
- **Actual**: ratio metrics → `weightedLevel` over entries WITHIN the month;
  sales → `periodTotal` (a real sum, not a level).
- **Official**: `mergedTargetsForLocMonth(ds, loc, y, m)` (engine/review-engine.js
  — the SAME per-store-per-past-month official-target resolver the Review/EOM
  flows already use) returns the full merged-target object for that store/month;
  fed through the metric's OWN existing `officialVal(loc, settings)` accessor via
  a one-off `{targets: {[loc]: histTargets}}` "fake settings" object — since
  `mergedTarget()` (this file) already reads exactly `settings.targets[loc]`,
  this reuses each metric's real field-extraction logic (including labor's
  `resolveLaborTarget` special case) without duplicating it.
- **Absence is honest**: a store/month with no learning history, or no real
  activity that month, is simply absent from the result — never a fabricated 0.

**Leak-free, verified directly**: a test appends a wildly different (0.99 vs a
steady 0.21) month AFTER the backtested month and confirms the already-computed
Smart number for the earlier month doesn't change — the filter `x.d < monthStartISO`
is the actual mechanism, this proves it holds through the real function, not just
by code inspection.

## What "Official" means for metrics with no monthly-level history

Research done before this dispatch (see `memory/dispatch-smart-targets-sort-and-
3-metrics-2026-09-14.md`'s "Related / still open" section) found only some
metrics have TRUE month-by-month official history in `monthly_targets`: sales,
labor %, TPPH, FOB % + its 6 components, base food, paper cost, disc/coup. OEPE
and R2P only have YEARLY history (`yearly_targets`); avg check and promo % have
NEITHER — DEFAULT_TARGETS is the only source. `mergedTargetsForLocMonth` already
handles all three tiers via its own merge chain (`DEFAULT_TARGETS < ds.targets
(yearly) < ds.allMonthlyTargets[period] < ds.monthlyTargets`), so no special-
casing was needed in `runMonthlyBacktest` itself — a metric with only yearly or
only default-constant history will correctly show the SAME Official value across
every backtest month, which is the honest answer (no finer-grained history was
ever recorded), documented in the panel's footer text rather than left to look
like a bug.

## Data floor

`daily_glimpse_daily`-sourced metrics (labor %, OEPE, avg check, promo %) have a
hard floor at 2026-07-01 (forward-only emailed stream, no backfill possible per
CLAUDE.md's own documented finding). Months before that floor simply produce no
row for those 4 metrics — not fabricated, not silently wrong, just absent, and
the panel's empty-state message names this explicitly rather than reading as a
generic "no data" dead end.

## UI

New "📊 Backtest (YTD)" toggle in the header (off by default — fetches a FULL
YEAR of history on first click via `metric.fetch(daysBack)` with `daysBack`
computed from Jan 1 of the current year plus a 120-day buffer so January's own
90-day trailing window reaches into the prior year; not fetched on every panel
open). When active, replaces the live Official/Smart/Current table with a
per-store-per-month table (Store | Month | Smart (as-of) | Actual | Official
(as-loaded) | Smart err % | Official err %, the closer-to-actual column
highlighted green per row) plus a summary strip (Smart MAPE vs Official MAPE,
"Smart closer in X/Y · Official closer in X/Y"). CSV export follows
(`exportBacktestCSV`); Print and Apply-as-Official are hidden in backtest mode
(neither makes sense against historical rows). Uses the SAME scope filter
(All/FL/OK/patch/store) as the live view.

## Tests

`src/__tests__/dispatch-smart-targets-backtest-2026-09-14.test.js` — 8 cases:
a real computed Smart+Actual+Official for a real store (laborpct, ratio metric),
the leak-free guard described above, two "absence is honest" cases (no current-
month activity; no prior learning history), a peer-anchoring case proving Smart
differs from a plain own-trajectory read when a stronger peer exists, a sales
(monthly) metric case proving Actual is a real period SUM not a level, an
empty-input degradation guard, and a real `SmartTargetsPanel` render clicking
the actual Backtest button and confirming real month labels + store data appear.

All 8 confirmed to fail against pre-fix code (`git stash` round-trip).

Full suite 513/513 files, 4901/4901 tests. Build clean, 547.10 KB / 850 KB eager-payload budget.
