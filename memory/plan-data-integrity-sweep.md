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
- **Not yet applied to code** — the owner was asked to pick the exact floor value before
  `graded-visits.js`/`supabase.js` get changed; a future session should pick up from here once
  that's decided, using these measured numbers rather than re-measuring from scratch.

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
