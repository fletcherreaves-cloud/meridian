---
name: plan-data-integrity-sweep
description: Bounded data-integrity sweep plan — the greppable defect signatures earned from the 2026-08-08 bug run, with measured counts of how many sites match each.
metadata:
  type: project
---

# Data-integrity sweep — scoped by defect signature, not "check everything"

Owner asked (2026-08-08, after a long bug run): *"How about all the calculations and data we've
been working through. We found a lot of common things while doing so. Do you think a full sweep
to make sure we have all of the data pinned down would be wise?"*

**Answer: yes, and it is bounded.** A general "verify every number" audit is unbounded and would
mostly re-confirm working code. What this session actually produced is better: every bug was an
instance of a RECURRING, GREPPABLE class. A sweep targeting those signatures is finite and
high-yield.

## The signatures, each earned from a real bug

| # | Signature | Real instance | Measured sites |
|---|---|---|---|
| 1 | Ratio guarded only by `>0`, so a near-zero denominator survives | `getDOWTrend` → 1,200,000% chart axis (v4.912) | **132 candidate ratio sites** |
| 2 | Panel reads `ds.*Rows` directly instead of the resolver | Dialed-In blank trend; the manual-only class | **56 metric reads** (210 more are structural and fine) |
| 3 | Units mixed — dollars into a count field | Register Audit `refundCnt += refundCashless` (v4.903) | small; `*Cnt` sites scanned clean apart from that |
| 4 | Partial/incomplete period treated as complete | Biggest Miss grading today (v4.917); swing alarm (v4.880); count completeness | recurred **3+ times** — highest-priority class |
| 5 | Missing data indistinguishable from a real zero | `avg6`→0 graded as passing green; failed read vs empty read | audit `\|\| 0` on metric reads |
| 6 | Exclusion filter that can eliminate EVERY candidate | `fetchLY` skipping all 7 offsets on tagged days (v4.910) | audit every multi-candidate fallback chain |
| 7 | Ordering/precedence wrong | resolver manual-before-auto in 30 of 35 chains (v4.905) | now guarded by a test |
| 8 | Date representation divergence | `dKey('2025-07-15')` off by one (v4.907) | now guarded by a test |

## Why #4 deserves to go first

It is the only class that has recurred **three separate times** in different subsystems, and
every instance produced a number that was *plausible but wrong* — the worst kind, because
nobody investigates a number that looks reasonable. `businessDate()` (4am ABC cutover) already
exists as the shared helper; the sweep is finding every place that should use it and does not.

## Signature #4 — SWEPT (2026-08-09)

An Explore pass enumerated candidates beyond the 3 already-fixed instances (swing-feed
`weeklyBuckets`, store-dash "Biggest Miss" v4.917, count-completeness threshold). 7 more sites
matched, all fixed the same way — exclude the still-open business day via `businessDate()` (or
the store-dash `RankingView`'s own `addDR(now,-1)` convention, matched locally for consistency):

1. `src/engine/backtest.js` `_computePeriodMape` — Dialed-In 6W/4W/2W/1W MAPE columns.
2. `src/views/above-store-onepager.js` MTD range.
3. `src/views/labor-tools.js` — both PERIODS arrays (2wk/4wk/6wk/mtd/3m/6m/ytd all ended at
   literal "today"; graded against a tight ±0.5–1.5pt band, the most user-visible of the group).
4. `src/views/store-dash.js` `UnifiedTargetsPanel`'s `_inRangeMs` — no upper bound at all.
5. `src/views/smart-targets.js` — the live panel's `now` was passed straight through as `asOf`
   to `weightedRecencyLevel`/`medianProject`; the engine functions themselves were already
   correct (exclusive `dt < end`), the bug was purely in the caller's boundary, one day away
   from being baked into `monthly_targets` via "Apply as Official."
6. `src/views/analytics.js` `StoreOnePager` (print/export narrative).
7. `src/views/store-dash.js` `RankingView`'s `MTD` preset — its own LW/L2W/L4W/L6W siblings
   already excluded today; only MTD was missed.

Explicitly checked and left alone: `pace-to-target.js`/`CurrentMonthPaceSection` (correct
day-elapsed pacing), `schedule-summary.js` `normLaborPct` (handles it via a value-band filter,
not a date cutoff — different mechanism, same correctness), `backtest.js`'s main "Full" MAPE
(already has a 14-day cutoff), and every preset that already did `addDR(now,-1)`.

Regression guards added (class-level, not per-instance): `backtest.test.js` — a partial "today"
row with a resolvable LY must not move mape6w/4w/2w/1w; `smart-targets.test.js` — `windowRate`
excludes a row dated exactly at the exclusive `asOf` boundary, the contract every live caller
above depends on.

Signatures 1 (ratio >0 guard, partially swept below), 2 (ds.\*Rows direct reads), 3 (unit
mismatches), 5 (missing vs zero) are still open.

## Signature 6 — RESOLVED as a byproduct (v4.924, 2026-08-09)

The named instance (`fetchLY` skipping all 7 LY offsets because every candidate was tagged,
e.g. Tishomingo's 450 tagged days) can no longer happen: v4.924 removed tag presence from
`fetchLY`/`fetchLYDate`/`fetchGC`'s exclusion logic entirely, per an owner directive that tagging
must never itself exclude a day — only a measured anomaly (median ± k·MAD against the day's own
peer candidates) does. See the v4.924 commit and `memory/vision-and-roadmap.md` if a dedicated
write-up gets added. Not re-verified against every OTHER "multi-candidate fallback chain" the
signature's method calls for — only the LY-lookup chain that produced the real bug.

## Signature 1 — PARTIALLY SWEPT (2026-08-09)

An Explore pass ranked the ~132 candidates by whether the denominator is plausibly small in real
data (a single day/hour's count or dollar figure) versus structurally large (weekly/monthly/
district aggregates — most of the 132, correctly fine). Fixed the highest-confidence, most
measurable findings:

1. `src/lib/supabase.js` `_finalizeQsrAct`'s `salesVsLYPct` — same day-level YoY sales-ratio
   shape as the original `getDOWTrend` bug, just reached through the DAR/QSRSoft cloud path.
   Drives sort order + color coding + a printed executive report in `one-pager.js` — a single
   closure-day LY value could have put a mediocre store at the top. Fixed by reusing the exact
   measured ±300%/-75% band from v4.912 (`_yoyPoint` in forecast.js), reimplemented locally in
   supabase.js as `_yoyPct` (lib/ has no existing dependency on engine/, so two constants were
   copied rather than importing across that layer boundary).
2. `src/engine/forecast.js` `varPct` (the per-day forecast-error %) — denominator is that day's
   own actual, so a closure-day actual against a normal forecast rendered nonsense like
   "-111,000%" in the Forecast Table (`store-dash.js`). Different fix shape than #1: this
   percentage's grading (`pass`/`Math.abs(varPct)<=tolerance`) is already correct even at extreme
   magnitudes — a huge miss should fail — so nothing about `varPct` or `pass` changed. Only the
   store-dash.js table CELL is capped at a display-only ±300% (with a trailing '+' marking a
   true value beyond it); sorting/grading elsewhere still sees the real number.
3. `src/views/store-dash.js` `lyVar` in the weekly-scenario projection — turned out to be dead
   code (computed, never read; `scenarios.bull/base/cons` use fixed ±4% multipliers, not it).
   Deleted rather than fixed.

**Deferred, not fixed — would need real data to measure a threshold, not a decision to skip:**
- `src/views/graded-visits.js` hourly LY comparison % — an hour-slot's LY transaction count of 1
  is normal (e.g. overnight), not an edge case, so the day-level ±300% band does NOT transfer;
  needs its own measured floor from real hourly data.
- `src/lib/supabase.js` `tpph`/`r2p`/`oepe`/`park`/`kvst` (rate-per-day metrics, `_finalizeQsrAct`)
  and the matching `tpph`/`avgChk` cloud fallback in `store-dash.js` — same shape, needs a
  measured minimum-count floor on the denominator (actHrs/cars/orders that day), not a percentage
  band.
- `src/views/signals.js` `pacePct`/`gcPacePct` — partial-day-so-far denominator; overlaps
  signature #4's territory but the missing piece here is a magnitude guard, not a date cutoff.
- `src/engine/backtest.js` `detectCleanDataStart`'s `cv=mean>0?...:Infinity` — low visibility
  (internal calibration-window decision, not user-facing), lower priority.
- `src/views/dt-speedofservice.js` several `us/cnt` sites — lower confidence, would want one
  shared measured floor rather than per-site fixes.
- `src/features/lifelenz.js` `lfzErr`/`mErr` — already pre-filtered to `sales>100`, likely fine
  as-is; the `>0` guard flagged in the sweep is on the wrong variable but low real-world risk.

None of these were given an invented threshold — per the standing caution below, a made-up
number is not a fix. Pick this back up once Supabase access lets real distributions get pulled.

## 2026-08-09 session — org_events round-trip verified (bug found + fixed), Black Friday
## cleanup shipped, denominator-floor measurement tooling prepared

Picked up three deferred items. Confirmed live (not assumed) that this Claude Code web/remote
environment only has `VITE_SUPABASE_ANON_KEY` — no `SUPABASE_SERVICE_ROLE_KEY` and no way to mint
a real user JWT. `curl`-ing `org_events` and `qsr_daily_activity` with the anon key returns HTTP
200 with an empty array (RLS correctly blocking an unauthenticated caller), not a connection
failure — reachability (CLAUDE.md's "egress allowlisted" note) and authenticated access are two
different things, and this environment only ever had the first. Every item below hit this same
wall; each was handled by building something a human (or a future session with real credentials)
can act on, rather than guessing.

1. **org_events cloud-sync round-trip (v4.923) — verified by code audit, found and fixed a real
   bug (v4.927).** `syncUserEventsToCloud`'s delete/edit cleanup called
   `deleteOrgEventsByLocDate(loc, date)` with no label — deleting EVERY row for that date, even
   though org_events intentionally allows multiple events per day (a sports game AND a school
   closure on the same date) while the local `mf_events` registry it mirrors allows exactly one.
   Editing or deleting the one event visible locally on a multi-event day would silently wipe any
   OTHER cloud event sharing that date — no error, no local symptom (the deleted sibling was never
   visible locally to notice missing). Fixed by scoping every delete to the removed/replaced
   entry's own label, matching org_events' actual `unique (loc, date_start, label)` key. Also
   extracted the diff logic into a pure, exported `diffUserEventsForCloudSync` (events-import.js)
   with 7 unit tests — this is what makes the round-trip logic verifiable at all without live
   Supabase access.

2. **Black Friday duplicate-tagging cleanup — shipped as an in-app tool (v4.928), not a live
   cleanup.** The bad data (5 tagged Black-Friday days for 2026, per the owner's report) lives in
   the owner's browser localStorage, which this session cannot reach, and any copy that made it to
   the cloud is behind the same RLS wall as everything else. `findFloatingDateMismatches()`
   (retail-events.js) matches `userEvents` entries by LABEL (the buggy rule's default TYPE was
   'school_break', not a retail type, so type-matching would have missed every instance) against
   RETAIL_EVENT_RULES, flags any tagged date that doesn't fall in that rule's real computed window
   for its year, and Calendar Manager's Recurring Rules tab now shows a one-click cleanup banner.
   Generalizes past Black Friday to Small Business Saturday/Cyber Monday/tax-free weekends — any
   rule sharing this failure mode. 8 unit tests reproduce the exact reported case (Thanksgiving
   2026 = Nov 26, computed live via the real `thanksgiving()` rule; only Nov 27 is correct).

3. **Denominator-floor measurement tooling — written, not run.** `scripts/measure-denominator-
   floors.mjs` (follows the `scripts/measure-retail-impact.mjs` convention: requires
   `SUPABASE_SERVICE_ROLE_KEY`, read-only, `--dry`-equivalent by default since it never writes)
   pulls real distributions for the two clearest deferred sites — tpph/r2p/oepe/park/kvst day-
   level denominators (actual_punched_hours / fc_trans_cnt / dt_trans_cnt / mfy_trans_cnt, via the
   `qsr_daily_activity_daily` rollup view with a raw-hourly fallback) and the graded-visits.js
   hourly `ly_transactions`/`ly_product_sales` LY-comparison denominators — and prints
   percentile/IQR buckets by denominator size. It does NOT choose a threshold; it measures and
   prints, the same shape as the swing-alarm (-10%, 676 store-weeks) and count-completeness (0.75,
   bimodal distribution) derivations already in this codebase, so a human picks the floor from the
   printed buckets. Needs the owner (or a session with `SUPABASE_SERVICE_ROLE_KEY`) to actually run
   it — this session could not. Still not covered by this script: `signals.js`
   `pacePct`/`gcPacePct` (a magnitude guard on a different shape — partial-day-elapsed, not a count
   floor), `backtest.js` `detectCleanDataStart`'s `cv`, and the `dt-speedofservice.js` `us/cnt`
   sites — left for a future pass, still not given invented thresholds.

## 2026-08-09 session, part 2 — PR #101 review fix + the measurement script actually run

**v4.929 — fixed a real, confirmed bug in v4.928 before merge.** An independent review (a
coordinator session, on PR #101 before merge) caught and reproduced that `findFloatingDateMismatches`
checked a tagged date against `shoppingAnchor()`'s collapsed scheduling sub-window instead of the
retail rule's TRUE window. For long statutory spans (`fl_back_to_school`, a full month) this made
the new one-click "Remove all mistagged" cleanup capable of deleting a correctly-tagged real event
just because it fell outside the anchored opening weekend — the exact class of destructive bug
v4.927 (earlier in the same PR) was written to prevent, reintroduced by the new tool built on top
of it. Fixed by checking `inst.start`/`inst.end` (the rule's real window) directly; 2 new
regression tests. Also documented (deferred, lower severity per the same review) a second gap:
`diffUserEventsForCloudSync` can't correctly clean up a single day of a multi-day org-sourced
event via the generic label-based path (inert no-op, not destructive — see the code comment at
the site in events-import.js for the full reasoning on why a real fix needs a shape change).
**Lesson for future sweep work:** a second independent reviewer caught what code-review-by-the-
same-session missed, on the FIRST tool this sweep shipped with real delete power. Worth an
adversarial second pass on any future data-destructive tooling before merge, not just tests.

**The owner supplied `SUPABASE_SERVICE_ROLE_KEY` and the measurement script was actually run** —
first attempt timed out even with service-role access (bypasses RLS, so this was a genuine
performance problem, not an access one): `qsr_daily_activity_daily` is a plain SQL `view`, not
materialized, so it re-runs the full `GROUP BY` over the entire underlying table on every read,
and that table is large enough for an unbounded read to hit Postgres's statement timeout. Fixed
the script to bound part A by `--days` (same as part B already did) and fall back to the raw
hourly table on a query ERROR, not just on an empty result. Re-ran successfully with `--days 60`.

**Results (60-day window, 2026-06-10 → today):**

- **Part A (tpph/r2p/oepe/park/kvst day-level denominators) — mostly a non-issue in practice.**
  1,645 of 1,647 real (loc, date) rows had `actual_punched_hours ≥ 24`; `fc_trans_cnt`/
  `dt_trans_cnt`/`mfy_trans_cnt` rarely fell below ~50 for a full day, and where they did (a
  handful of rows) the metric value wasn't dramatically more extreme than the well-populated
  buckets. The `>0` guard the sweep flagged as risky essentially never triggers in real daily
  data — lower priority than assumed. Left un-fixed; a defensive floor (~10) would be cheap
  insurance but isn't urgent.
- **Part B (hourly LY-comparison %, graded-visits.js `hourMetrics`) — real and measured.**
  `ly_transactions` bucketed against the resulting comp-%'s IQR: **1 → IQR 1000** (n=75, p10
  -100%/p90 +2200%), **2 → IQR 500** (n=49), **3-4 → IQR 195.8** (n=99), **20-39 → IQR 39.1**
  (n=5,885), **40+ → IQR 23.4** (n=21,282, the stable baseline). A defensible floor sits around
  `ly_transactions ≥ 20` (~1.7× baseline IQR) to `≥ 40` (fully stable) — a judgment call left to
  the owner, per the standing "no invented threshold" rule; the script does not choose one.
  **Also refutes an assumption in this doc's own earlier entry:** "an hour-slot's LY count of 1
  is normal, not an edge case" turned out to be wrong — measured `ly_transactions === 1` in only
  **75 of 29,109** hour-slots with any LY count at all (0.3%). Rare, not normal.
- **Applied (v4.930):** owner chose stability over max coverage — floor at the tier where IQR
  reaches its stable baseline, not the first tier where it merely improves.
  `MIN_LY_TXN_FOR_COMP = 40` / `MIN_LY_SALES_FOR_COMP = 800`, wired into `graded-visits.js`
  `hourMetrics()` (extracted to a module-level exported pure function so this is unit-tested, not
  just eyeballed). `supabase.js`'s day-level tpph/r2p/oepe/park/kvst were left un-fixed per Part
  A's finding above (real denominators rarely get small enough to matter at the daily grain).

## Signature #5 — SWEPT, 3 fixed (v4.931, 2026-08-09)

An Explore pass found 6 candidates matching "missing data indistinguishable from a real zero
where it flows into a grade/sort/color." Fixed the 3 highest-confidence, highest-impact:

1. `src/engine/pipeline.js` `computeCtrlScore` — no data-presence gate AT ALL (unlike its sibling
   `computeOpsScore`, which correctly gates every term on `t.X>0&&p.X>0`). A store with zero
   controls data scored every "lower is better" component as a perfect 0 → `ctrlScore≈100` →
   `buildBrief`'s "STRENGTH — CONTROLS ELITE... this store is a cash integrity model" for a store
   with NO data. Fixed using `p._cov` (forecast.js `compute6wk`'s observation-count map — existed
   already, built for exactly this, but only ever consumed by store-dash.js's Controls table).
2. `src/views/store-dash.js` `DistrictGrid`'s `'labor'` sort — missing labor data ranked #1 (best)
   in the district since a bare `||0` is the best possible value for a lower-is-better metric. The
   adjacent `'oepe'` sort already used a 999 "missing→worst" sentinel; `'labor'` never got it.
3. `src/views/smg-voice.js` "By Store — Best → Worst" rail — `avgScore` was already correctly
   `null` for a no-comment store, but the row color and star bar both re-masked it back to
   "worst score" (red, 0 filled stars) — inconsistent with the adjacent numeric label on the same
   row, which already showed "—". Extracted to a tested `storeScoreColor()`.

**Also fixed (v4.932):** `smart-targets.js`'s salesGrowth `base` fallback (full `!=null` chain
through avg6w→avg12w→avg26w→avg52w, matching `recent`'s own window order — previously dead-ended
at a bare `avg12w||0` if both short windows were null) and `insights.js`'s
`monthlyLaborSummary`/`monthlyLaborExtended` (each metric now has its own coverage-weighted
denominator instead of sharing `sales`, which let a missing laborPct/tpph on a real-sales day
skew the average toward zero; 4 new tests). **Signature #5 is now fully closed** — 5 of 6 Explore
findings fixed, the 6th (`store-analytics.js` NaN→0) has no observed user-facing effect since its
only call site already falls through correctly.

## Signature #2 — SWEPT, all 12 HIGH-confidence sites fixed (v4.933-continued, 2026-08-09)

All 12 HIGH-confidence sites below (11 new + `RankingView`'s GC fix already merged from an
earlier coordinator commit) now route through `metric-source.js`/`vs-ly.js` instead of reading
`ds.laborRows`/`ds.opsRows`/`ds.ctrlRows` directly. `npm test` (1064/1064) and `npm run build`
both pass clean after the sweep. Detail per site:

- `store-dash.js` `RankingView` GC rollup — already fixed (fd8e7fe, pre-existing on the branch).
- `store-dash.js` `CompareLineChart` — 42-day trend now via `metricSeries(ds,loc,range,'sales')`
  per selected store instead of `ds.laborRows` only.
- `analytics.js` `DateRangeReport` — `rows` (drives actualSales/fcSales/lySales/MAPE/passRate)
  now built from `metricSeries(...,'sales')`'s auto-first date set; avgOepe/avgTpph/avgLabor/
  avgCheck pull their per-day inputs from the resolver, then still run through the SAME
  weighted-rollup helpers (`ratioOfSumsDerived`/`weightedMean`/`ratioOfSums`) as before — only
  the per-day sourcing changed, not the aggregation math.
- `analytics.js` `StoreOnePager` — `lR`/`oR` rebuilt from `metricSeries` (sales/gc/avgCheck/
  oepe/park/laborPct/tpph); `laborPct`/`tpph` simplified to a single `avg(lR,...)` call since
  the resolver's chain already puts ctrlRows ahead of laborRows (the old `avg(cR,...)||avg(lR,...)`
  double-read is now redundant). `vsLY` sourced via a matching auto-first LY sales series. FOB
  stays on raw `ctrlRows` — confirmed no `fobPct` chain exists in `metric-source.js` yet.
- `analytics.js` `computeMetricAverages` — all 9 `CORR_PREDICTORS` (oepe/park/r2p/labor/tpph/
  otHrs/cashOS/tRedA/discPct) now resolve via `metricAvg` through a small id→key map; the
  `MetricCorrelationExplorer`'s own separate raw reads (~line 395-397) were NOT touched — flagging
  as a smaller follow-up, not urgent (was MEDIUM-adjacent in the original triage, not HIGH).
- `analytics.js` `computeOpsAnalysis` — day values via `metricDaily`; DOW trimmed-mean baselines
  via `metricSeries` + a DOW filter, replacing the `[...peerCtrl,...peerLab]` pooled-array trim
  (which double-counted a date if BOTH ctrlRows and laborRows had it — the new version reads one
  auto-first-resolved value per date, which is more correct, not just auto-first).
- `analytics.js` AI Brief context (`buildBriefContext`, feeds the `LocationBrief` prompt directly)
  — totalSales/avgCheck now via `metricSeries('sales'/'gc')` instead of `ds.laborRows` only.
- `store-analytics.js` `computeRevenueOpportunity` items #9-12 (avg-check momentum, DT sales mix,
  salaried-manager compliance, promo/discount drag) — all four now via `metricSeries` against
  their existing `metric-source.js` chains (`avgCheck`/`dtMixPct`/`salaryMgrHrs`/`promoAmt`, all
  of which already existed — this was purely a "not calling the resolver" gap, not a missing chain).
- `store-analytics.js` `ModelComparisonPanel`'s `weekHistory` — per-week actual sales now via
  `metricSeries('sales')` instead of `ds.laborRows` only.
- `scheduling.js` `OpportunityReport`'s `laborIdx` — replaced the hand-rolled glimpse→ctrl→labor
  / dar→ctrl→labor priority loops with `metricDaily` calls against a small `ds`-shim object
  (`{glimpseRows,ctrlRows,laborRows,qsrActSummaryRows:qsrActRows}`, since this component receives
  the four source arrays as separate props, not a full `ds`). Confirmed behavior-neutral: the
  `laborRows.actHrs` fallback leg was already dead in both the old code and metric-source.js's
  chain (that loader never emits `actHrs` — documented in metric-source.js's own comment), and
  the `src:'glimpse'|'ctrl'|'labor'|'dar'` labels the old code tracked were never actually read
  by any consumer, so dropping them is not a behavior change.
- `record-day.js` `computeRecords` — rebuilt to iterate `metricSeries` per loc (sales/gc/
  avgCheck/oepe/kvst/r2p) instead of only scanning `ds.laborRows` then conditionally layering
  `ds.opsRows` on top of days `laborRows` already had an entry for (the exact "auto-only day
  never gets a chance to set/break a record" bug the triage flagged). `dataEnd` now uses the
  shared `dailyDataFreshness(ds)` helper instead of scanning `laborRows` alone. Breakfast sales
  and the inStoreGC/dtGC split stay manual-only (`ds.laborRows`) — no auto chain exists for
  either field; `gc` itself now uses the resolver's combined `gc` chain instead of manually
  summing `inStoreGC+dtGC`, which is a genuine improvement (more coverage, same field meaning).
- `morning-brief.js` — three changes, all additive fallbacks (nothing removed from the existing
  hand-rolled priority order, so a store that already had peaks/glimpse/dar data sees identical
  output):
  1. `computeStoreNorms`'s `oepeNorm`/`kvstNorm`/`gcSalesRatio` (8-week baseline, gates 4
     correlation rules on `!oepeNorm`) now fall back to `metricAvg`/`metricSeries` when a store
     has no 3-Peaks upload at all — previously such a store's `oepeNorm` was permanently `null`
     and silently disabled every rule depending on it.
  2. `oepe`/`kvst`/`kvsu`/`dtPark` in `assembleBriefStoreData` gained a final `metricDaily`
     fallback tier after peaks→glimpse→dar — closes a real gap where `opsServiceRows`/`opsRows`
     (the manual Ops Report) were never read by this file at all.
  3. The LY comparison (`lySales`/`lyGC`) now falls back to `autoFirstDaily`'s same-date DAR LY
     field when `laborRows` has no matching historical row — previously vs-LY was blank for any
     historical date only the auto DAR covered, even when the current-side data was fine. The
     current-side (`curSales`/`curGC`) matching logic (±2-day tolerance) was deliberately left
     untouched to avoid narrowing its existing slop.

**Deferred, not part of this pass:**
- The "4 independently-maintained reimplementations" architectural finding (analytics.js's
  `labInRange`/`ctrlEffective`/`svcEffective`, store-dash.js's `UnifiedTargetsPanel` `SPEC`,
  smart-targets.js's `cloudLabor`/etc., promo-roi.js's `buildDailyRecords`) — a consolidation
  pass on its own, not attempted here.
- The MEDIUM-confidence judgment calls from the original triage (`PerformanceCalculator`,
  `weeklyTrend`, `OperatorSummaryPanel`'s FOB%, `ForecastAccuracyPanel`/`computeStoreSigma`
  backtest-shaped consumers — flagged as possibly-deliberately-conservative, `weekly store-
  projections cloud-actuals supplement`, `detectAnomalies`/DOW baseline scanner, `eom-supervisor.js`
  `computeStoreEOM`) — still open, still owner-judgment calls, not touched.
- `MetricCorrelationExplorer`'s own raw `ds.laborRows`/`opsRows`/`ctrlRows` reads (separate from
  `computeMetricAverages`, same file) — noticed while fixing `computeMetricAverages` next to it,
  not in the original HIGH-confidence list, left alone.

<details><summary>Original triage (2026-08-09, before the sweep above)</summary>

## Signature #2 — RE-MEASURED, NOT YET SWEPT (2026-08-09) [STALE — see swept section above]

The original "56 metric reads, 210 structural" count (top of this doc) is **stale** — a fresh
Explore pass found **349 raw `ds.*Rows` occurrences across 33 files**, and that old 56/210 split
doesn't map cleanly onto the current code. Most are structural/fine (loaders, coverage displays,
already-decided exceptions: `LaborAnalyticsPanel`, `store-analytics.js` `dowData`,
`visit-readiness.js`). Full triage from the Explore pass, by confidence:

**HIGH confidence (should call `metricDaily`/`metricAvg`/`matchedVsLY` instead):**
- `store-dash.js:2245-2246` `RankingView` group-rollup `curGc`/`lyGc` — the comment directly above
  says every OTHER column in this function was already fixed for exactly this bug; GC was missed.
- `store-dash.js:3582-3597` `CompareLineChart` — 42-day sales trend from `ds.laborRows` only, no
  auto fallback. This is literally the "Dialed-In blank trend" shape the signature is named for.
- `analytics.js:5563-5610` `DateRangeReport` avgOepe/avgTpph/avgLabor/avgCheck — manual-only.
- `analytics.js:987-1030` `StoreOnePager` — hand-rolled vs-LY + manual-only averages, feeds the
  printed one-pager.
- `analytics.js:367-384` `computeMetricAverages` (feeds `MetricCorrelationExplorer`) — 9 covered
  metrics, manual-only.
- `analytics.js:3601-3618` `computeOpsAnalysis` (Ops Metrics Anomaly Cross-Check) — hand-rolled
  ctrl/labor priority, no Glimpse/DAR fallback.
- `analytics.js:5993-5996` AI Pre-Forecast/District Brief context — feeds the AI prompt itself.
- `store-analytics.js:725-899` `computeRevenueOpportunity` — avg-check momentum, DT mix,
  salaried-manager compliance, promo drag, all manual-only.
- `store-analytics.js:574-599` `ModelComparisonPanel`'s `weekHistory` — manual-only sales.
- `scheduling.js:333-352` `OpportunityReport` — a line-for-line reimplementation of a chain
  already in `metric-source.js`, done inline instead of calling it.
- `record-day.js:115-154` `computeRecords` (the Records feature) — manual-only, so a record set on
  an auto-only recent day would never surface.
- `morning-brief.js:284-295`/`:220-282` — hand-rolled vs-LY + oepe/kvst/park/kvsu, duplicates the
  resolver. Matches this doc's own earlier "remaining candidate: morning-brief peaks metrics."

**MEDIUM confidence / owner judgment calls:**
- `store-dash.js:2366-2378` `PerformanceCalculator` — comment claims "no registered auto source
  yet" for avgCheck/avgRate, which is now false (both are in METRIC_SOURCES); low stakes (slider
  starting points only).
- `analytics.js:7840-7856` `weeklyTrend` — sales/vsLY manual-only, sitting directly next to code
  that already documents migrating OEPE/Labor/T-Reds in the same view for the same reason.
- `labor-tools.js:1394-1414` `OperatorSummaryPanel` — mostly migrated correctly; FOB % still
  reads raw `ds.fobRows` with no `qsr_fob` fallback (the fallback pattern already exists
  elsewhere, `eom-supervisor.js`'s `fobSnapshotByStore`). Also: `lRows`/`cRows`/`oRows` in the
  same function look like dead leftovers from before the migration.
- `analytics.js:3144-3200` & `:6180-6212` `ForecastAccuracyPanel` backtest + weekly scan, and
  `analytics.js:7758-7838` `computeStoreSigma`/MAPE-drift — same shape, BUT `backtest.js` has an
  explicit documented precedent (v4.904 comment) that switching calibration reads to
  `metricSeries('sales')` broke calibration for all 27 stores. Flagging for owner judgment, not
  asserting these are wrong — backtest-shaped consumers may need to stay conservative on purpose.
- `analytics.js:7945-7957` weekly store-projections cloud-actuals supplement — a hand-rolled
  per-day auto-fill, documented as a real fix for a real bug, functionally reasonable but
  duplicates the resolver instead of calling it.
- `store-analytics.js:78-100` `detectAnomalies` and `analytics.js:4105-4140` (DOW baseline
  anomaly scanner) — same shape as the exempted `dowData`, but unlike it, these could silently
  stop flagging anomalies on auto-only days. Borderline.
- `eom-supervisor.js:74-230` `computeStoreEOM` — extensive, heavily-commented, owner-verified
  (cross-checked against QSRSoft screenshots) parallel auto-first logic. Looks deliberate, in the
  same spirit as the `visit-readiness.js` exception, not an oversight.

**Architectural finding, bigger than any single site:** there are now at least **4 independently-
maintained reimplementations** of the "manual-first, then auto/emailed, freshest-per-day" merge
`metric-source.js` exists to centralize — `analytics.js:6892-7154` (`labInRange`/`ctrlEffective`/
`svcEffective`), `store-dash.js:2601-2680+` (`UnifiedTargetsPanel`'s `SPEC`/`valuesForLoc`),
`smart-targets.js:108-185` (`cloudLabor`/`cloudOps`/`cloudCtrl`/`cloudFob`), and
`promo-roi.js:19-54` (`buildDailyRecords`). None is confidently "broken" today, but this is
exactly the failure mode `data-sourcing-standard.md`'s opening paragraph warns about. Worth a
consolidation pass on its own, separate from fixing individual sites.

**Not yet fixed** — this needs owner prioritization before touching ~15+ HIGH-confidence sites
across that many files in one sweep; picking up here in a future session.

</details>

## Signature #1 — remaining deferred items reviewed (2026-08-09, session part 3)

Went back through the 3 items still open after v4.926/v4.930's fixes:

- **`backtest.js` `detectCleanDataStart`'s `cv=mean>0?...:Infinity`** — reviewed in detail, **no
  fix needed**. An `Infinity` CV always fails the `cvPass` stability check, so a single all-zero-
  sales week just prevents that window from being called "stable" — and the function's own
  documented fallback for low confidence is `return null` → "apply no restriction," which is
  already the safe direction (a missed detection is no worse than today; this can't make it
  falsely assert bad data is clean). Fails safe by construction. Closing this out rather than
  leaving it as a vague "lower priority" TODO forever.
- **`dt-speedofservice.js`'s `us/cnt` sites** — reviewed, **no fix needed**, no new measurement
  required. Every site here (`storeData`'s early/late split, `stationData`, `hourData`,
  `daypartData`) aggregates the SAME `dt_trans_cnt`/`fc_trans_cnt`/`mfy_trans_cnt` fields Part A of
  `measure-denominator-floors.mjs` already measured for the day-level rate metrics — just summed
  over MORE days and/or MORE stores per bucket (coarser, not finer). More summing only grows a
  count denominator, never shrinks it, so this is strictly safer than what Part A already showed
  rarely gets small in practice.
- **`signals.js` `pacePct`/`gcPacePct`** — **RESOLVED (session part 4): no code change.** Extended
  `measure-denominator-floors.mjs` with Part C (cumulative-so-far, district-wide — `planPace` sums
  every store together for one date, not per-store, a mismatch an earlier draft of Part C got
  wrong and the owner caught by asking "what are the impacts" before applying anything) and Part D
  (the separately-real per-store `salesPct` metric, vs `mean_sales`). Measured live: district-wide
  stabilizes fast (IQR down to single digits by ~9am); per-store takes until afternoon. Owner
  decision: **keep cumulative as-is, no floor** — the existing formula was already right, this
  investigation was purely confirmatory. Part E (added after) measured the STANDALONE
  non-cumulative ratio for comparison and surfaced a real afternoon-bias lead — spun out into its
  own shipped feature, see `memory/project-hourly-projection-accuracy.md`.

## Signature #3 — VERIFIED CLEAN (2026-08-09)

The intro table's original note ("small; `*Cnt` sites scanned clean apart from that") never got
its own write-up or a fresh live scan — closing that out. Full re-scan of `src/` for the class
(a `*Cnt` field assigned/incremented/averaged from a `*Amt`/`*Dollar`/`*Cash`/`*Sales` value, or
a parser column-mapping crossing "Count"/"#" and "Amt"/"$"/"Dollar" labels) came back clean:

- `src/parsers/index.js` — every `fooCnt: fc(h,'...Cnt'/'...#'/'...Count')` maps to a
  count-labeled header; every `fooAmt: fc(h,'...Amt'/'...$'/'...Dollar')` maps to a
  dollar-labeled header, across all 6 sheet parsers (Controls, Smart Targets, Register Audit,
  Cash Sheet, Daily Glimpse, 3-Peaks). No crossed mappings found.
- `src/lib/supabase.js`'s snake_case↔camelCase table mappings, `src/engine/metric-source.js`'s
  chain table, `src/engine/signal-registry.js`'s `unit:'count'` vs `unit:'currency'` signal
  declarations, `src/views/store-dash.js`'s target-editor field config — all name-consistent,
  no `*Cnt` metric/field ever absorbs a `*Amt` source or vice versa.
- The one known real instance (`refundCnt += refundCashless`, v4.903/Notes 61) is still fixed
  and commented in `src/utils/register-audit.js`, and already has a dedicated class-level guard:
  `src/__tests__/register-audit-units.test.js` asserts counts stay integral and never absorb
  dollar figures — this already satisfies the sweep Method's step 4 ("add a guard for the CLASS,
  not the instance"), so no new test was needed.

**No code changes required.** Signature #3 is now closed. All 8 signatures from the original
table are accounted for: 1 (partially swept, remaining items reviewed/closed), 2 (swept), 3
(verified clean, this entry), 4 (swept), 5 (swept), 6 (resolved as a byproduct), 7 and 8
(resolved, guarded by tests).

## Method

1. Enumerate sites per signature (the counts above are a first pass, already run).
2. Triage each: real defect / intentional / not applicable. **Expect most to be fine** — the
   value is the small number that are not.
3. Fix with a measured threshold where one is needed (see the ±300% bound in v4.912 — derived
   from 40,000 store-days, not chosen).
4. Add a guard for the CLASS, not the instance. Signatures 7 and 8 already have one; that is
   the model.

## Standing caution

Three hypotheses were wrong for every one that was right this session. The sweep must
**measure each candidate against real data** before changing it — a "fix" applied to a site
that was already correct is a regression, and v4.904 already broke calibration for all 27
stores exactly that way.

Related: [[feedback-measure-dont-reason]], [[data-sourcing-standard]],
[[feedback-performance-budget]], [[notes-62-queue]].
