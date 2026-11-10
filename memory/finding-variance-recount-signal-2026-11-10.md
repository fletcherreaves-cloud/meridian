---
name: finding-variance-recount-signal-2026-11-10
description: Research result (task #130, follow-on from plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md's open question #3/#4) — does an item's own variance shape predict a recount? Measured against real qsr_variance_stat/inv_count_sessions data. Finding: no usable signal, and not enough sample to responsibly calibrate one either way. Do not build a variance-based recount/anomaly detector on this basis. ✅ UPDATE, same day — the data-model gap this file's own Recommendation section named as the real blocker is now CLOSED (schema-qsr-onhand-item-history-2026-11-10.sql + deriveItemHistoryRows() in scripts/qsrsoft-onhand-pull.mjs) — see the note at the end. The research verdict above is unchanged; what changes is that re-running this same analysis in a few months, once real item-level history has accumulated, is now possible and will have much better statistical power than the 12-sample ceiling this pass hit.
metadata:
  type: finding
---

# Does item-level variance predict a recount? Measured, not guessed.

## The question this closes

`plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md`'s owner answers #3 and #4 both
landed on the same open research question, logged as its own backlog item (task #130) rather than
guessed at: **does a variance swing's own shape (`qsr_variance_stat`'s `dol_diff`/`variance`) carry
a measurable signal for "this looks like a correction, not a fresh count" — the basis for both a
within-session recount heuristic and a Tier-2 statistical anomaly flag?**

The owner's own framing: *"We could start looking at the variance of an item and make a calculated
guess as to whether a subsequent recount was due to an erroneous result or a mis-entry."* That's a
real, buildable idea — but, per that doc's own words, "RESEARCH, not a known formula to wire in."
This file is that research, run against real production data (40,671 `qsr_variance_stat` rows,
1,831 `inv_count_sessions` rows, pulled directly via the Supabase REST API this session).

## Method

Across-session recounts (a second, distinct `count_date` for the same `loc`+`cls`+`period` in
`inv_count_sessions`) are the one kind of recount this app can already see directly — the doc's own
"ground truth to calibrate against." The within-session case (same day, re-keyed before submit)
leaves literally no trace in current data (`qsr_onhand`/`inv_count_sessions` are both keyed off a
single `last_counted`/`count_date`, no revision log) — so the only testable proxy is: **do
recounted class-periods show different item-level variance than non-recounted ones?** If the
across-session proxy shows no signal, that's real evidence against the within-session heuristic
too (same underlying mechanism, finer grain), not proof, but a meaningful downgrade in confidence.

Two versions, in order of rigor:

1. **Cross-sectional**: every `(loc, cls, period)` with count-session data, split into "recounted"
   (≥2 distinct `count_date`) vs. "single-session," joined to that class-period's aggregate
   `qsr_variance_stat` (mean/median `|variance|` and `|dol_diff|` per item, summed per class).
2. **Paired, within-store**: the cross-sectional version pools *different* stores into each group,
   which confounds the recount effect with ordinary store-to-store variance differences (some
   stores just run noisier counts structurally). The paired version restricts to `(loc, cls)` pairs
   that have **both** a recounted period and a single-session period on record, and compares that
   one store's own variance between its two kinds of months — removes the store-level baseline.

## Results (measured, 2026-11-10)

- **Across-session recounting is the norm, not a rare event.** 362 of 422 `(loc,cls,period)`
  groups with count-session data (86%) show 2+ distinct count dates. Only 60 are single-session,
  and only 12 of those 60 have a matching `qsr_variance_stat` row at all. This alone reframes the
  original premise — "detect the recount" isn't a rare-event problem in this data; recounting
  already happens almost every time, so an item-variance signal would need to distinguish *degree*
  of recount-worthiness, not presence/absence.
- **Cross-sectional (n=308 recounted vs. n=12 single-session class-periods):** recounted
  class-periods show a *lower* median `|variance|` per item (233.8) than single-session ones
  (534.4) — the opposite of "recounts happen because variance was high." Not trustworthy on its
  own: the single-session group is 12 class-periods, almost certainly a handful of distinct stores
  with their own baseline noise, which is exactly the confound the paired version exists to remove.
- **Paired within-store (n=12 `(loc,cls)` pairs with both period types):** a literal coin flip — 6
  of 12 pairs show higher variance in their recounted month, 6 show lower. Median delta (8.88) is
  small relative to the scale of the variance values themselves (hundreds). **No directional
  signal survives the more rigorous test.**
- **Data coverage caveat:** a 1,000-row sample of `qsr_variance_stat` shows `food`/`condiment`/
  `paper` classes represented; `non-product` did not appear at all in that sample, despite being
  the 4th-most-common class in `inv_count_sessions`'s own recount groups (53 of 362). Variance
  tracking appears to be food-cost-scoped by nature (yield/waste/expected-usage math doesn't apply
  the same way to non-product items), not a pull gap — worth confirming before relying on
  `qsr_variance_stat` for a non-product-class finding of any kind.

## Why this doesn't improve with more analysis

This isn't a "ran out of time" result — it's a real data-model ceiling. `qsr_variance_stat` is a
**monthly aggregate**, one row per `(loc, period, wrin)`. It cannot see which count DATE within the
period produced which number, let alone which SUBMISSION within a date. The cross-session proxy
above is the closest thing to "variance around a recount" obtainable from data this app currently
collects, and even that proxy — with a real, if small, sample — shows no usable signal. Squeezing
the same 40,671 rows harder (different percentiles, a formal test statistic) won't change that;
the sample for the one comparison that matters (single-session class-periods) is capped at 12 no
matter how it's sliced, because that's how many exist.

## Recommendation

**Do not build a variance-shape-based recount or anomaly detector now.** There is no measured
signal to calibrate one against, and the sample available is too small to trust a threshold either
way — exactly the trap this repo's own "measure it, don't guess" standing rule exists to prevent.

What the original plan's Tier 1 (store-target-based thresholds) and Tier 3 (hard-impossibility
rules — negative on-hand, a swing bigger than the item's own on-hand $ value, an implausible
per-unit price change) still need from this: **nothing — both are unaffected by this finding** and
remain buildable now, same as the plan already said.

If a variance-based recount/anomaly signal is still wanted later, **the blocker is a data-model
gap, not more analysis**: logging a per-count-event (ideally per-submission) item-level on-hand/
variance snapshot — not just the monthly rollup `qsr_variance_stat` already is — would be the
actual enabling change, and that's a schema + pull-script change (new table, or an append-only
variant of the existing on-hand pull), a separate, concretely scoped follow-on from this research
pass, not something to attempt blind from today's data.

## ✅ Update, same day — the data-model gap is now closed

Owner, on reading this file's Recommendation section: *"I thought we solved this by logging all
count results to Supabase. Please verify. If we didn't, that should be the solution. Log them,
not overwrite…so we can historically recall the state at time of count."* Verified directly
against the real schema files before responding — `inv_count_sessions` (the thing the owner was
remembering) genuinely is append-only, but only at the **session** grain (how many items, was
coverage met); `qsr_onhand`/`qsr_variance_stat` are both still `(loc, period, wrin)` rolling-latest
at the **item** grain, confirmed from their own `create table` statements. Two different gaps —
only the session one had been closed.

Built the item-level counterpart the same day, same pattern as `inv_count_sessions`:
- `supabase/schema-qsr-onhand-item-history-2026-11-10.sql` — new append-only table
  `qsr_onhand_item_history`, one row per `(loc, count_date, wrin)`, same RLS/tenant pattern as
  every other operational table. **⚠️ Needs the owner to run this SQL file in the Supabase editor
  before it writes real data** — same handoff as every other new-table migration in this repo.
- `scripts/qsrsoft-onhand-pull.mjs`'s new `deriveItemHistoryRows()`, wired in right alongside the
  existing `deriveSessionRows()` call (same `deduped` rows, same point in the daily pull) — snapshots
  each item's on-hand qty/price/$ at its own real `last_counted` date before the next recount would
  otherwise overwrite it in `qsr_onhand`. Idempotent on `(loc, count_date, wrin)`, so growth tracks
  real counting activity, not pull frequency. Unit-tested (`src/__tests__/qsrsoft-onhand-pull-item-
  history-2026-11-10.test.js`) against recount, skip-when-uncounted, and zero-value-preservation cases.
- `src/lib/supabase.js`'s new `loadQsrOnHandItemHistory({loc, wrin})`, mirroring the existing
  `loadQsrVarianceHistory` loader so the data is actually readable once it exists.

**This does not retroactively fix the n=12 sample problem above** — history only accumulates from
whenever the owner runs the schema file forward. It does mean this exact research is re-runnable
later with real item-level ground truth instead of the class-level proxy this pass had to use, and
it's the real, concrete form of "the blocker is a data-model gap, not more analysis" this file's
own Recommendation section called for.

**Still not solved, and not claimed to be:** the true WITHIN-session case (same day, re-keyed
before submit, no separate `count_date`) — this only captures one snapshot per calendar day (the
daily pull's own cadence), so a same-day correction still leaves no trace. That remains the one
part of the original owner ask with no buildable answer today.

## Reproducing this

The pull-and-compare script used for this pass (direct Supabase REST, paginated, no app code
touched) is not checked in — it was a one-off analysis script, not a reusable tool. Re-running this
same comparison later (e.g., once more months of data exist) is straightforward: join
`inv_count_sessions` (grouped by `loc,cls,period`, counting distinct `count_date`) to
`qsr_variance_stat` (same key, lowercase `cls` — the two tables disagree on casing, `Food` vs.
`food`) and compare `|variance|`/`|dol_diff|` between the two groups, paired by `(loc,cls)` where
possible.
