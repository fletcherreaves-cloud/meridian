---
name: dispatch45b-degenerate-stdev-guard
description: Closes dispatch #45 §A's second, independent cause -- a z-score rule's exact-zero-stdev guard didn't catch a stdev that's non-zero but negligible, so a peer population clustered near-zero could turn any real value into a fabricated outlier z-score (a live case rendered "0.04 vs threshold 2.50 -- mean 0.00, stdev 0.00 -- Flagged" where both were non-zero but rounded away). Measured live baselines before choosing the mechanism: a coefficient-of-variation floor was tried and rejected (it doesn't separate the failure), an absolute per-rule min_stdev does. Folded into the still-open PR #492 so dispatch #46 Part B doesn't ship ahead of this fix.
metadata:
  node_type: memory
  type: project
---

# The degenerate-stdev guard — dispatch #45 §A, second cause, closed

2026-08-20. This was flagged as a real gap in my own earlier work: `memory/dispatch-45.md`'s Part A
carries a "⚠️ A SECOND, INDEPENDENT CAUSE" section (present since the dispatch first landed on
`main`) that I read but did not implement when I built `min_numerator` earlier this session — only
the materiality gap got fixed, not this one. Both were always described as "fix both or neither."

## The bug

`evaluateZScoreRule()`'s existing guard is `if (!baseline.stdev)` — catches a stdev that is
**literally** zero, not one that's merely negligible. A live subject (item `10195-005`, store
`35064`) rendered:

```
Dollar-variance rate vs. store sales
0.04 vs threshold 2.50 -- store: mean 0.00, stdev 0.00, n 26        Flagged
```

Both `mean` and `stdev` were genuinely non-zero (the guard above would have caught a true zero as
an honest null) — they merely rounded to `0.00` at 2 decimal places for display. `z = (0.04 - ~0) /
~0` explodes. A peer population clustered at near-zero turns any real, unremarkable value into a
fabricated multi-sigma outlier — a defect in the baseline's own shape, unrelated to whether the
subject's dollar amount clears a materiality bar (`min_numerator` cannot fix this: a subject can
clear a real dollar floor and still be scored against a meaningless sigma).

## Measured before choosing the mechanism

The dispatch names two candidate mechanisms — a coefficient-of-variation floor, or an absolute
`min_stdev` — and explicitly instructs measuring before picking either. Pulled every
`security_findings.baseline_context` row for both rules (live, 2026-08-20):

**CV was tried first and rejected.** The actual `|z| > 10` INV-002 subjects (10 of them) have CVs
(`stdev/mean`) of 0.25–3.5 — squarely inside the population's own normal CV range (median 0.66,
n=5,278). A CV floor would not separate these cases from ordinary ones; CV measures how tight a
peer group is *relative to its own mean*, and this failure mode is about the *absolute* scale of
the stdev being too small to divide by meaningfully, independent of what the mean happens to be.

**Raw stdev does separate it.** INV-001 (n=5,196): p5=1.670, p10=3.309, median=20.997 — a
well-behaved distribution where the near-zero tail (41 rows) is essentially the same set the
existing exact-zero guard already catches; only 0.75% of the population sits below CV 0.1. INV-002
(n=5,278): p5=0.000702, p10=0.000861, median=0.002455 — the metric's own scale is tiny throughout
(it's a per-$1,000-sales rate against store-month sales in the millions), so there is no floor
choice that's "free," but `min_stdev=0.001` (near p10) nulls 6 of the 10 worst `|z|>10` offenders
(all with stdev < 0.001) while leaving the mid-range population untouched.

## What was built

`src/engine/security-rules.js` — `min_stdev` checked in `evaluateZScoreRule()`, immediately after
the existing exact-zero guard, before the z-score is computed. Same class as `n < MIN_BASELINE_N`
and the exact-zero case (honest null — the population genuinely cannot support a z-score) — never
`pass:false`, since this is not a materiality decision the way `min_value`/`min_numerator` are.

`supabase/schema-security-rules-min-stdev.sql` — full-literal `logic_expression` replacement for
INV-001 (`min_stdev: 1`) and INV-002 (`min_stdev: 0.001`), preserving each rule's other keys
verbatim (`min_value`/`min_denominator` for INV-001, `min_numerator` for INV-002 — the value
`schema-security-rules-phase1f.sql` sets, applied in the same deploy). Written as a full literal,
not a jsonb `||` merge, matching every prior migration in this rule family and the shape
`security-rules-thresholds.test.js`'s parser expects.

## Verification

- 3 new engine unit tests (a negligible-but-nonzero stdev nulls out; a real stdev above the floor
  computes normally; no `min_stdev` set behaves exactly as before).
- 2 new call-site wiring tests through `computeItemFindingsForRule()` — a hand-built 6-store fixture
  with peers clustered tightly (rates 0.99–1.01, real stdev ≈0.0071) and one store genuinely
  different (rate 5.0): with `min_stdev` set, the subject nulls out; with it unset on the identical
  data, the same subject flags with `|z| > 100` — proving the guard, not the data, changed the
  outcome.
- Threshold guard (`security-rules-thresholds.test.js`) extended with a third measured-range map
  (`MEASURED_STDEV_P10`, deliberately separate from the rate/numerator maps — a fourth independent
  quantity on its own scale) and a preservation check confirming the full-literal migration doesn't
  silently drop the other keys it must carry forward. Mutation-tested (set INV-002's `min_stdev` to
  100, confirmed the suite fails; restored, confirmed clean).
- Full suite: 1770/1770 passing (160 files). `npm run build` clean, no entry-chunk impact (no panel
  changes needed — the "degenerate baseline" reason text flows through the panel's already-generic
  Undetermined-state rendering with zero new code, since `buildDecisionSentence()` already reads
  `verdict.reason` for any undetermined verdict).

## Sequencing — folded into the still-open PR #492, not a new one

The user's own stated ordering was "degenerate-stdev guard → #46 A/B" — because dispatch #46 Part B
(the decision sentence) could otherwise describe a fabricated outlier in confident prose. Dispatch
#46 A/B had already shipped as part of PR #492 (not yet merged) before this ordering was made
explicit. Rather than reopening or reworking that PR, this fix lands as an additional commit on the
SAME branch/PR, so the guard is in place before #492 merges — satisfying the intent without
duplicating the earlier work. Once `schema-security-rules-min-stdev.sql` runs (handed back, not
applied), no live INV-002 decision sentence can describe a degenerate-baseline artifact as a real
finding.

## SQL to run against live Supabase — handed back, not assumed applied

```sql
-- supabase/schema-security-rules-min-stdev.sql -- see the file for the full measured rationale
update public.security_rules
set logic_expression = '{"numerator": {"field": "variance", "agg": "sum", "abs": true}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 20, "min_denominator": 10, "min_stdev": 1}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-001';

update public.security_rules
set logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_numerator": 15, "min_stdev": 0.001}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';
```

(This reproduces `schema-security-rules-phase1f.sql`'s own `min_numerator: 15` for INV-002 —
running this migration alone is sufficient; `phase1f.sql` doesn't need a separate run first, though
running it is harmless since this is a full-literal replacement either way.)

## Remaining engineer-queue items — not started this pass

Per the stated queue (degenerate-stdev guard → #46 A/B → the two buildable inventory schemes → #46
C/D), the next two items are the waste-log-padding and phantom-gains inventory rules named in
`memory/finding-security-scheme-coverage-2026-08-20.md`, followed by dispatch #46's remaining Part
C items (2–5) and Part D (visual analysis). None of that is built in this pass — this dispatch is
scoped to the stdev guard alone, given its explicit position at the front of the queue and its
status as a real, already-shipped-adjacent correctness bug.
