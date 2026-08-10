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

**Deferred, not part of this (HIGH-confidence) pass:**
- The "4 independently-maintained reimplementations" architectural finding (analytics.js's
  `labInRange`/`ctrlEffective`/`svcEffective`, store-dash.js's `UnifiedTargetsPanel` `SPEC`,
  smart-targets.js's `cloudLabor`/etc., promo-roi.js's `buildDailyRecords`) — a consolidation
  pass on its own, not attempted, still open.
- `MetricCorrelationExplorer`'s own raw `ds.laborRows`/`opsRows`/`ctrlRows` reads (separate from
  `computeMetricAverages`, same file) — noticed while fixing `computeMetricAverages` next to it,
  not in the original HIGH-confidence list, left alone.

**MEDIUM-confidence judgment calls — picked up later the same evening, 4 of 7 fixed, PR #105:**
`PerformanceCalculator`, `weeklyTrend`, `OperatorSummaryPanel`'s FOB%, and the `detectAnomalies`/
`runScan` DOW baseline anomaly scanners (this last one confirmed as a REAL live bug, not
theoretical — `labor_rows` had gone stale ~2026-07-23, so both scanners had been silently blind
to weeks of real anomalies) are now fixed and merged. `ForecastAccuracyPanel`/`computeStoreSigma`,
the weekly store-projections supplement, and `eom-supervisor.js`'s `computeStoreEOM` are still
open, still owner-judgment calls, deliberately not touched. Full detail in the "MEDIUM confidence"
sub-section inside the collapsed triage below — despite that block's `[STALE]` label, THIS
specific sub-section was updated live and is current; only the rest of that collapsed block is
the frozen original triage.

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

**MEDIUM confidence / owner judgment calls — 4 of 7 fixed (2026-08-09 evening), 3 left alone.**
*(This specific sub-section is CURRENT, unlike the `[STALE]` label on the rest of this collapsed
block — it was updated after the HIGH-confidence pass shipped. See also the summary in the live
Signature #2 section above.)*

Fixed:
- `store-dash.js` `PerformanceCalculator` — avgCheck/avgRate baselines now route through
  `metricAvg` like every other baseline in the function; the "no registered auto source yet"
  comment was stale (both are in `METRIC_SOURCES`, avgRate as a derived metric).
- `analytics.js` `weeklyTrend` — district-wide 6-week sales/vsLY now via `metricSeries` per loc,
  summed; finishes the migration already done for OEPE/Labor/T-Reds in the same view.
- `labor-tools.js` `OperatorSummaryPanel` — FOB% now falls back to the auto `qsr_fob` snapshot
  (via the same `fobSnapshotByStore` helper `eom-supervisor.js` uses, manual-first since FOB is
  a deliberate monthly submission) when the manual FOB Report is missing for the period. Removed
  confirmed-dead `lRows`/`cRows`/`oRows` locals.
- `store-analytics.js` `detectAnomalies` + `analytics.js` `runScan` (DOW baseline anomaly
  scanners) — **confirmed real, not theoretical**, before touching: `labor_rows` stopped
  receiving new rows around 2026-07-23 (documented in `metric-source.js`'s own header, from the
  incident that motivated the whole auto-first migration) while the auto DAR covers every store
  through today, so both scanners had been silently blind to ~2+ weeks of real anomalies. Fixed
  via `metricSeries`, with date keys re-derived through `dKey()` from a noon-anchored
  `new Date(k+'T12:00:00')` (not used raw from `metricSeries`, which keys off UTC while `dKey`
  reads local calendar fields for the userEvents/holiday lookups) — verified the round-trip is
  timezone-invariant with a standalone script before committing.

Left alone, still owner judgment calls (not touched, no sign-off requested yet this session):
- `analytics.js:3144-3200` & `:6180-6212` `ForecastAccuracyPanel` backtest + weekly scan, and
  `analytics.js:7758-7838` `computeStoreSigma`/MAPE-drift — `backtest.js` has an explicit
  documented precedent (v4.904 comment) that switching calibration reads to
  `metricSeries('sales')` broke calibration for all 27 stores. Backtest-shaped consumers may
  need to stay conservative on purpose.
- `analytics.js:7945-7957` weekly store-projections cloud-actuals supplement — a hand-rolled
  per-day auto-fill, documented as a real fix for a real bug, functionally reasonable but
  duplicates the resolver instead of calling it. Lowest priority — refactor only, no bug.
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

## Signature #4 — RECURRED in new code, twice, one day after being marked SWEPT (2026-08-10)

The "SWEPT (2026-08-09)" claim above was about the 7 sites that existed *then*. It was never a
durable guarantee — new code written the very next day reintroduced the identical defect twice,
independently, because nothing enforces the pattern:

1. `src/engine/pipeline.js`'s new sales-decline detector (PR #109, v4.940, merged 2026-08-10)
   built its 28-day window as `{s:new Date(Date.now()-28*86400000), e:new Date()}`.
2. `src/views/attention-now.js`'s rolling-window follow-up (v4.941, same day) copied the exact
   same literal `Date.now()` window-end into a second site.

Both shipped, both merged, before a PM review 2 minutes after PR #109's merge caught it. Real
production impact, reproduced (not asserted) via `buildBrief` with a synthetic 27-completed-days
+ 1-partial-today dataset: a healthy -7% store (below the -8% watch line) fired WATCH at every
degree of partial fill; a genuine -10% store (which should only ever fire WATCH) falsely
escalated to CRIT. Math: contaminating one day of a 28-day window with a (partial-cur,
full-ly) pair shifts the aggregate pct by roughly `(dailyLY - dailyLY×todayFrac) / (28×dailyLY)`
— for todayFrac near 0 (early morning), close to a full extra 1/28th of a day's LY value
subtracted from an otherwise-accurate 28-day gap.

**Fixed 2026-08-10** (this session, hotfix branch): both sites now end the window on the last
CLOSED business day via `businessDate()` (swing-feed.js's 4am ABC-cutover helper) + `addD`,
reusing the `labor-tools.js`/`above-store-onepager.js` pattern instead of re-deriving the
boundary. Regression test added with a `todayFrac` parameter (`pipeline-sales-decline.test.js`)
— unlike the suite's existing `dsWithDailyRatio` fixture, which applies one constant ratio to
ALL 28 days (today included) and therefore models today as already-complete, structurally
unable to catch this class. Verified the new test actually fails against the pre-fix code
(reverted pipeline.js, re-ran, confirmed 4 of 6 new assertions failed with the exact false-CRIT/
false-WATCH shape described above, restored the fix) before trusting it as a regression guard.

**Thresholds re-verified against the corrected window**, not assumed still valid: pulled
`qsr_daily_activity_rollup` via service-role key, re-computed the 28-day matched-day
sales-vs-LY distribution ending on the corrected last-closed-business-day boundary (26 of 27
stores with matched-day coverage, same as the original PR #109 measurement). Every number
shifted down (contamination inflates every decline uniformly, not just Atoka's) but the
CONCLUSION did not: p10 -7.28% (was -9.9% through the contaminated window), median -1.63% (was
-1.6%), Atoka still the sole outlier at -14.91% (was -15.4%), 32525 still 2nd-worst at -10.91%
(was -11.1%), 35242 still 3rd at -9.77% (was -9.9%). The existing -12%/-8%/$3,000-gap floors
still cleanly separate Atoka-alone-crit / 32525+35242-watch / 23 others clean — no threshold
values changed, only the code comments citing them (now cite the re-verified numbers).

**A grep for the pattern class (`Date.now() - N*86400000` / `e: new Date()`) turned up more
candidates the 2026-08-09 sweep's 7-site list never covered** — that sweep was scoped to
sites found via an Explore pass at the time, not an exhaustive grep. Triaged by whether the
window feeds a hard grade/severity (high risk) vs. an average/narrative context (lower risk,
one partial day is diluted across a longer denominator) vs. genuinely benign (no comparison at
all):

*High risk — averaging window short enough, or the site is specifically an anomaly/deviation
detector, that one partial day materially moves the output:*
- `src/views/store-analytics.js` `detectAnomalies` — range is `{s:'2000-01-01', e:new Date()}`,
  i.e. no upper bound at all. This is an anomaly detector: a still-filling today will almost
  always read as a deviation from the historical baseline purely because it isn't finished yet
  — the exact "alarming at 10am, fine by close" shape Notes 61 named, just in the anomaly
  scanner instead of the swing alarm.
- `src/views/analytics.js` `runScan` (the AI Backtest Scanner / DOW-baseline anomaly panel,
  `fullRange = {s:'2000-01-01', e:new Date()}`) — same shape as above, same risk.
- `src/views/store-analytics.js` computeRevenueOpportunity's Avg Check Momentum — `range2`
  (14-day, includes today) compared against `range6` (prior 4 weeks, does not include today).
  A 14-day denominator gives one partial day real weight (~7%); this produces a displayed
  momentum reading, not just an internal average.
- `src/engine/forecast.js` T2W trend (`t2wCut`/`t4wCut`) — `recentRows`/`priorRows` filters
  have no upper bound at all (`row.date>=t2wCut`, no `<=` ceiling), so a logged-today row rides
  along uncapped into `r.t2w`, which feeds forecast model comparison/selection.

*Lower risk — same pattern, but the averaging window is long enough (42–90 days) that one
partial day's dilution is small, or the output feeds a narrative/starting-point rather than a
hard grade:*
- `src/features/morning-brief.js` `computeStoreNorms` (8-week/56-day window) — sets baseline
  "norms" other correlation rules compare live values against.
- `src/views/analytics.js` `computeMetricAverages` (90-day window) — feeds the Metric
  Correlation Explorer's predictor averages.
- `src/views/analytics.js` AI Pre-Forecast/District Brief context (42-day window, already
  auto-first per the earlier sweep's signature #2 pass) — feeds a raw series into an LLM
  prompt for narrative reasoning, not a computed percentage/grade.
- `src/views/store-dash.js` `PerformanceCalculator` baseline (42-day) — already flagged
  low-stakes by a prior session ("just slider STARTING POINTS the user freely adjusts from").

*Checked and NOT a recurrence:*
- `src/engine/backtest.js` `_periodSeries` (6-week window ending `new Date()`) — LOOKS like a
  hit, but the very next lines already filter the derived `_periodRowsAll` to `dk<_openDay`
  (`_openDay=businessDate()`) before it's used for grading — a comment there even names this
  same defect and v4.917's fix for it. `_periodSeries.length` itself is used once more, only
  as a diagnostic row count, not a grade. Already correctly guarded, just via a downstream
  filter instead of adjusting the range end — verified by reading the surrounding code, not
  assumed safe from the grep hit alone.
- `src/views/store-dash.js` `CompareLineChart` (42-day window) — plots raw daily $ values on a
  line chart, no ratio/grade computed. A partial today just renders as a lower point on the
  chart, visually obvious as in-progress, not a hidden distortion.
- `src/views/scheduling.js` week-bounds default (`weekBounds(new Date(Date.now()-7*86400000))`)
  — seeds a date-picker's default Sun–Sat range, not a comparison.
- `src/app/App.js` two `pending_reports` sync-freshness cutoffs (30-day/180-day) — filter which
  already-processed reports to re-check, not a vs-LY or grade computation.

**Not fixed in this hotfix** — the PM's plan batches these into a separate "wrong-number
batch" pass (Track 1, item 2) once this hotfix lands cleanly, rather than expanding the hotfix's
blast radius. Flagging here so the list survives past this session regardless of what happens to
the PR conversation.

**Open question this recurrence raises, for whoever picks up the batch**: sweeping instances one
at a time has now visibly failed to hold — the fix landed 2026-08-09, and new code broke it again
2026-08-10, twice, same day. Worth deciding whether the batch pass should also produce a single
shared helper (e.g. an `endOfLastClosedBusinessDay()` export next to `businessDate()` in
swing-feed.js) that every trailing-window site calls, so the convention is one import away
instead of five lines of `addD`/`businessDate()` boilerplate repeated at each site — the more
copy-pasted the correct pattern is, the more likely a sixth recurrence looks "consistent with
everything else nearby" to whoever writes it next.

Related: [[feedback-measure-dont-reason]], [[data-sourcing-standard]],
[[feedback-performance-budget]], [[notes-62-queue]].

---

## Signature #4 — GENUINELY CLOSED (2026-08-10, v4.944)

The open question above was answered: added `lastClosedBusinessDay(now = new Date())` to
`src/engine/swing-feed.js`, right after `businessDate()`. It returns midnight of the last CLOSED
business day (`businessDate()` minus one), so every site now does `lastClosedBusinessDay()` once
instead of re-deriving `addD(new Date(businessDate()+'T00:00:00'), -1)` inline. The two
already-shipped v4.942/v4.943 call sites (`pipeline.js` sales-decline detector,
`attention-now.js` rolling window) were refactored to call the shared helper too, so there is now
exactly one place this boundary is computed, not three-and-counting.

**All 5 high-risk sites fixed:**
1. `store-analytics.js` `detectAnomalies` — `range.e` now `lastClosedBusinessDay()` (was
   unbounded `new Date()`).
2. `analytics.js` `runScan` (AI Backtest Scanner) — same fix, same shape.
3. `store-analytics.js` Avg Check Momentum family (`range42`/`range2`/`range6`, feeds DT Sales
   Mix, Salaried Manager Compliance, Promo/Discount Drag too) — all now anchored to
   `lastClosedBusinessDay()`.
4. `forecast.js` T2W trend — `recentRows`/`priorRows` now bounded on both ends
   (`>=t2wCut && <=lastClosed`), where before there was no upper bound at all.
5. `pipeline.js:337` `cut4`/`now4` (feeds `pSales`/`pLY`, the 5 consumer sites the PM named:
   `analytics.js:2096`/`:2132`, `store-analytics.js:1714`/`:1985`, `store-dash.js:1559`) — fixed.

**All 4 lower-risk sites also fixed** (`morning-brief.js` `computeStoreNorms`,
`analytics.js` `computeMetricAverages`, the AI Pre-Forecast 42-day context,
`store-dash.js` `PerformanceCalculator` baseline) — "low risk is not zero risk" per the task.

**A 6th effective site found and fixed during the forecast.js work, not in the original list**:
`compute6wk`'s core `_range` (feeds `oepe`/`kvst`/`park`/`r2p`/`tpph`/`spph`/`laborPct`/
`actVsNeed`/`otHrs`/`actHrs`/`avgRate`/`cashOSPct`/`tRedAPct`/`tRedBPct`/`discPct`/`cashRefCnt`/
`posOverCnt`/`drawerOpens` via `metricAvg`) was unbounded the same way T2W was — and this range,
unlike `r.t2w` itself (display-only), directly feeds `calcOpsF`/`baseOpsF`, the forecast
adjustment factor `calibrateStore` grid-searches around. The PM's instinct that "#4 feeds
forecasting" was right even though `r.t2w` itself turned out not to be the feeding site — this
sibling window in the same function was. Also tightened 4 unbounded sub-filters in the same
function that shared the defect: `avgCheck`/`checkRows`, `kvsu`, `hasPettyCash`, `sRows`.

**Measured, not assumed** (real Supabase data, service-role key, before/after through the actual
production functions — `metricAvg`/`compute6wk`/`calibrateStore`, not a reimplementation):

- `compute6wk`'s underlying metrics: `discPct` moved most, up to **-11.23%** (store 35242) and
  several stores in the -9% to -11% range; `oepe`/`kvst`/`tpph` typically +1% to +2%.
- `baseOpsF` (the forecast adjustment factor `compute6wk`'s window feeds): up to **-10%** for
  stores 10915 and 32525, -8.76% for 10034, -2% for 13113, -1.02% for 18213, out of 13 stores
  checked.
- **Backtest MAPE: byte-identical before and after** for all 6 sampled stores (5.94, 5.56, 5.42,
  7.32, 6.53, 5.29). Not a wash — `calibrateStore`'s grid search treats `baseOpsF` as a
  parameter-independent constant and its other free parameters re-fit around whatever constant
  it's handed, so historical backtest grading is invariant to this correction even though a live,
  forward-looking forecast for a day not yet backtested benefits directly from starting from the
  corrected constant. No accuracy degradation — nothing to stop and report.
- `computeMetricAverages` (90-day): **70 store/metric combinations shifted >1%**, max **-21.56%**
  (`tRedAPct`, store 3708). **This corrects the 2026-08-09 triage above, which classed this site
  "lower risk"** on the assumption a 90-day denominator would dilute one partial day to
  near-nothing — real measurement shows it did not hold for T-Red rates at some stores. Flagging
  the correction explicitly rather than quietly updating the old classification.
- `PerformanceCalculator` baseline (42-day): 66 shifts >1%, sales/gc consistently +2.3% to +2.4%
  across nearly every store — systematic, not noise.
- `computeStoreNorms` (8-week): 46 shifts >1%, sales/gc consistently +1.75% to +1.77%.
- Avg Check Momentum family: only 1 shift >1% (-1.36%, `salaryMgrHrs`).
- AI Pre-Forecast 42-day context: 0 shifts >1%.
- `pSales`/`pLY` (site 5) and T2W trend (site 4): **0 shifts >1% measured today** — not because
  the fix doesn't matter, but because `ds.laborRows` (the manual Labor Report both sites read)
  has received no new rows since **2026-07-23**, 18 days stale as of this measurement. With no
  data near "today," the old contaminated window had nothing recent to pick up in the first
  place. Both are still correctly fixed for when manual uploads resume or full auto-first
  coverage lands.

**Deliberately NOT touched, and why**: `forecast.js`'s `allDep`/`allSales` (full-history
median-baseline, no "now" cutoff of any kind — out of scope, not a trailing window) and
`avg6()`/`obs6()` (`avg6` is dead code, never called with real args; `obs6` feeds only `_cov`
coverage COUNTS, not a displayed value — lower materiality, at most an off-by-one in a coverage
count, not a wrong grade). Also NOT re-touched: the 6-week-chart 1,200,000% bug — that was v4.912,
a different signature (near-zero denominator), already fixed, unrelated to this one.

**Verification**: 1108/1108 tests passing, build 2818.08 KB / 842.15 KB gzip (budget 2.8MB/850KB
— ~7.85 KB headroom remaining, tighter than the ~8KB flagged going in but not exceeded).

**Follow-up (v4.949, issue #117, 2026-08-10) — the boilerplate itself, not another instance.**
`lastClosedBusinessDay()` eliminated the specific recurring VALUE bug, but 3 sites still
hand-rolled the same `addD(new Date(businessDate()+'T00:00:00'),-1)` arithmetic instead of
calling the helper — not wrong (all 3 were already correct), but exactly the copy-paste source
this whole class recurred from 5 times. Pointed `above-store-onepager.js`'s MTD range and
`labor-tools.js`'s two PERIODS-array `lastClosed` derivations at the shared helper. **Explicitly
left alone** (per the same reasoning as the sweep above): `store-dash.js:2646` (`_openDayMs`) and
`analytics.js:1004-1005` (`_openDay`, whose `range.e` is `addD(_openDay,-1)` — the same VALUE as
`lastClosedBusinessDay()`, but `_openDay` itself is reused elsewhere for exclusive open-boundary
comparisons, so collapsing it would restructure code beyond this cleanup's scope, not just swap
an expression). Considered adding a structural test/lint rule banning the boilerplate pattern
outside `swing-feed.js` (per the issue's suggestion) — **not added**: a first attempt at the
regex immediately false-positived on `analytics.js:1004-1005` (open-day-boundary code that
legitimately does a `-1` day offset for an unrelated reason), which means a text-pattern test
can't reliably distinguish "boilerplate re-derivation of last-closed" from "open-day boundary
that also happens to derive an adjacent value" — the exact ambiguity that makes hand-rolling this
easy to justify case-by-case in the first place. A wrong test would either miss real future
violations or falsely flag legitimate code; neither is worth shipping. Judgment call, not a
default; flagging the reasoning here in case someone revisits it with a design for the test that
resolves the ambiguity (e.g. requiring the `-1`/`addD(...,-1)` to immediately follow the
`businessDate()+'T00:00:00'` construction on the same or next line, which both false-positive
sites do NOT do — they name an intermediate `_openDay` variable and consume it elsewhere too).

Related: [[feedback-measure-dont-reason]], [[data-sourcing-standard]],
[[feedback-performance-budget]], [[notes-62-queue]].
