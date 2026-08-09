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

Signatures 1 (ratio >0 guard), 2 (ds.\*Rows direct reads), 3 (unit mismatches), 5 (missing vs
zero), 6 (exclusion-eliminates-everything) are still open.

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
