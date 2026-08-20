---
name: dispatch42-baseline-relative-detection
description: Implements dispatch #42 — the z-score LOGIC_TYPE (INV-001/INV-002, baseline-relative), and a minimum-exposure floor widened from an INV-001 special case to every denominator-bearing rule, including the newly-live CASH-001..004 (measured against real audit_rows, landed same-day by #487).
metadata:
  node_type: memory
  type: project
---

# Dispatch #42 — baseline-relative detection, implemented

2026-08-20. `memory/dispatch-42.md` (widened same-day, after `main` was at `a8a6ea9` — #487
landed 9,947 real `audit_rows`). Builds on the merged Phase 1/1b (dispatches #39/#40, PR #473).

## Part 1 — the z-score LOGIC_TYPE (§3)

**The gap this closes:** both INV rules declared `baseline_type: 'store'`, and
`scripts/security-rules-run.mjs` computed a real store baseline and persisted it into
`security_findings.baseline_context` — but `evaluateRule()` never read it. Its verdict was
literally `cmp(value, threshold)`. The baseline was computed, stored, and ignored.

**`src/engine/security-rules.js`:**

- `evaluateRule(rule, dataContext, { loc, baseline })` — additive, backward-compatible.
  `threshold`/`ratio` rules ignore `baseline` entirely.
- New `evaluateZScoreRule()`: reuses `evalRatio()` for the raw rate, then
  `z = (value - baseline.mean) / baseline.stdev`, compared against `threshold` — sigma, not a
  rate, for this `LOGIC_TYPE` only.
- **Two independent gates, both required to flag**: statistically unusual (`z` vs. sigma) AND
  materially significant (raw `value` vs. an optional `min_value`). Failing the materiality gate
  is a real `pass: false` ("clear"), not an honest-null — the rule DID evaluate.
- Honest nulls: no baseline, `baseline.n < MIN_BASELINE_N` (5, a stated first-guess, not
  measurable from this sandbox — it's a property of `storeBaseline()`'s call-time population),
  `baseline.stdev === 0`.

**`scripts/security-rules-run.mjs`:** both call sites (`computeFindingsForRule`,
`computeItemFindingsForRule`) reordered to compute the baseline BEFORE evaluating. Caught a real
bug in the same pass: `fieldsFromExpr()` only branched on `logic_type === 'ratio'`, which a
z-score rule's identical numerator/denominator shape would have silently fallen through to the
wrong (`threshold`-shaped) branch.

**`supabase/schema-security-rules-phase1c.sql`** converts `INV-001`/`INV-002` in place:
`threshold` → `{"default": 2.5}` (sigma). `min_value` carries FORWARD dispatch #40's original
ratio threshold (20) as INV-001's materiality floor rather than inventing a new number — Step 0's
own "uniform / bent ruler" verdict made precise absolute calibration false precision (§4's
minimal path).

**Fixed after PR #481 review (2026-08-20), before merge — INV-002 does NOT get a `min_value`.**
The first version of this file carried INV-002's old ratio threshold (10) forward the same way as
INV-001's, without re-checking it against INV-002's own measured range. The reviewer caught that
this makes `materialityOk` false for the ENTIRE estate: INV-002's own first live run measured
`max=0.13` against that same 10, and a fresh re-measurement (same window/join, post-fix) confirms
it — `n=5,302, max=0.087, p95=0.0225`. A floor of 10 isn't permissive for this rule the way it is
for INV-001, it's unreachable — the z-score conversion would change the stored `logic_type` and
nothing observable. No `min_value` was substituted in its place, deliberately: reusing a fresh
percentile of the SAME distribution the z-score already ranks a subject against isn't an
independent materiality signal (INV-001's 20% traces to the plan's own flag guidance; CASH-004's
traces to an existing amber band) — it's just re-deriving "top ~5%" a second way. The z-score gate
alone (≥2.5σ vs. peers) is INV-002's detection until a real, independent dollar-materiality number
exists.

## Part 2 — the exposure floor, widened to every denominator-bearing rule (§5, amended same-day)

**Why this widened mid-dispatch:** the brief originally scoped the floor to `INV-001`'s
`exp_usage`. Two things changed that before this landed:

1. **The engine already has ONE shared choke point** for a zero denominator — `evalRatio()` and
   `evalThreshold()` both had the identical `if (!denominatorSum) return {value:null,...}`. Making
   the floor per-rule data (`logic_expression.min_denominator`) instead of an INV-001-only branch
   is the *simpler* build, not extra scope — a special case would have meant code that only helps
   one rule, sitting next to a guard that already existed for all of them.
2. **`#487` landed 9,947 real `audit_rows` rows same-day**, so `CASH-001`–`CASH-004` — `active =
   true` right now, unlike the deactivated `INV-001`/`INV-002` — were about to score real data for
   the first time, with the identical tiny-denominator pathology already measured on the
   inventory side. A cash false positive puts a person's name in an investigation queue; that
   made this more urgent on the cash side, not less.

**`src/engine/security-rules.js`:** `belowExposureFloor(expr, denominatorSum)` — the shared
choke widens from `!denominatorSum` to `denominatorSum < expr.min_denominator`, applied inside
both `evalRatio()`/`evalThreshold()`, so `z-score` (which reuses `evalRatio()`) gets the floor for
free with zero code of its own. `noExposureReason()` distinguishes "no exposure (zero
denominator)" from "denominator below minimum exposure floor (N)" for both `evaluateRule()`'s main
path and `evaluateZScoreRule()` — the same two paths that previously shared one generic message
now report which condition actually fired.

### The floors, all measured against live data 2026-08-20, none guessed

| rule(s) | denominator | floor | already-null (=0) | newly-null | survives |
|---|---|---:|---:|---:|---:|
| INV-001 | `exp_usage` | 10 | 220 / 5,302 | 423 (8.0%) | 4,659 (87.9%) |
| INV-002 | `storeMonthSales` | **none** | — | — | — (min observed: $2.1M) |
| CASH-001/003/004 | `drawerSales` (per emp, 28d) | 250 | 10 / 670 | 24 (3.6%) | 636 (94.9%) |
| CASH-002 | `drawerGC` (per emp, 28d) | 25 | 7 / 670 | 23 (3.4%) | 640 (95.5%) |

**INV-002 explicitly gets no floor** — measured, not assumed away: `storeMonthSales` (the
`qsr_fob` join) has a live minimum of **$2.1M** across the estate, four orders of magnitude from
zero. A floor here would be dead configuration, never able to fire. Stated plainly rather than
added reflexively — the shared mechanism means every denominator-bearing rule *could* carry a
floor, not that every rule *should*.

**None of the four applied floors comes close to nulling the estate** — the smallest survival
rate is 87.9% (INV-001). Per the standing instruction, that's the check that distinguishes real
protection from switching a rule off, and it's reported here rather than assumed.

**CASH-002's floor is corroborated at the raw-row level too**: the owner's own check on the
newly-landed data found `drawer_gc = 1` rows producing a stored `t_red_b_pct` of up to 172 — not a
rule input (dispatch #42 §5a re-confirms the mapping is sound and `_pct` columns feed nothing),
but the SAME tiny-denominator mechanism CASH-002's own `posOverCnt`/`drawerGC` ratio is exposed
to. The aggregate (summed-over-window, per-subject) measurement above found it materializes there
directly: 2 real subjects at `drawerGC=5` (raw rate 200) and `drawerGC=13` (raw rate 1692.3), both
now caught by the 25 floor.

**`supabase/schema-security-rules-phase1d.sql`** — new file, adds the CASH floors via an
idempotent `jsonb` merge (`logic_expression || '{"min_denominator": N}'::jsonb`) rather than
retyping each rule's full expression, avoiding drift against whatever the row's current JSON is.

### §5a — cash mapping re-confirmed sound, not re-litigated

Per the dispatch's own instruction not to redo this: no rows dropped on the `#487` load (every
chunk logged `N rows → N saved`), the stored scale agrees with the manual Register Audit path
(both write `0..1` fractions, no `×100` mismatch), and the `_pct` columns aren't read by anything
— `analyzeRegisterAudit` and `CASH-001..004` both recompute their own ratios from raw counts.
This dispatch's floor is exposure protection on top of an already-sound mapping, not a
correctness fix to it.

## Tests

`src/__tests__/security-rules.test.js`: removed `'z-score'` from the "unimplemented" parametrized
test. New describe blocks: 9 tests on the z-score engine (both gates, every honest-null path), 4
tests proving `min_denominator` is a genuinely SHARED mechanism — a plain `ratio` rule (CASH-001's
own shape) honors the floor identically to the z-score path, with the two null reasons
("zero denominator" vs. "below exposure floor") staying distinguishable.

`src/__tests__/security-rules-run.test.js`: 6 new tests, all **wiring** tests, not just engine
tests (standing rule from #366 — importing only `evaluateRule()` can't prove the reorder actually
ran). Runs `computeItemFindingsForRule()` end to end against a 6-store fixture (one real outlier,
five clustered peers, hand-computed z), confirms the outlier flags and a near-mean peer doesn't,
then proves the reorder matters by running the identical rule/row through the bare engine with no
baseline and confirming it degrades to an honest null. A fourth confirms the exposure floor
reaches this same call site. Two more (`computeFindingsForRule`, the CASH-domain path) confirm
the SAME floor mechanism reaches the cash side's call site too, using
`schema-security-rules-phase1d.sql`'s real shape.

## Explicitly not in this dispatch

Threshold precision tuning beyond the minimal-path floors (Step 0's own verdict). `INV-003`
(unexplained-variance-vs-waste). The cash rules' zero-row problem is now moot — `#487` fixed it
same-day, which is *why* §5 widened. Composite scoring, recurrence decay,
`sequence`/`window-function` `LOGIC_TYPE`s — still Phase 2/3. Any findings-viewer UI.

## Verified

- 13 new `security-rules.test.js` tests + 6 new `security-rules-run.test.js` tests (all wiring
  tests, spanning both the inventory and cash call sites).
- Full suite: 1685/1685 passing (157 files). `npm run build` clean; this dispatch touches only
  `scripts/` and `src/engine/security-rules.js` (not imported by any browser bundle) — no
  entry-chunk impact, eager total 512.25 KB / 850 KB budget, unchanged.
- `node --check scripts/security-rules-run.mjs`: clean.
- All floor percentiles/survival rates above are measured against live Supabase 2026-08-20 (the
  same session that implemented this), not estimated.

## SQL to run against live Supabase — NOT yet applied, hand back per instruction

Two files, both idempotent, safe to re-run:

```sql
-- supabase/schema-security-rules-phase1c.sql — see the file for full comments/reasoning
update public.security_rules set
  logic_type = 'z-score',
  logic_expression = '{"numerator": {"field": "variance", "agg": "sum", "abs": true}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 20, "min_denominator": 10}',
  threshold = '{"default": 2.5}',
  updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-001';

-- INV-002: NO min_value (PR #481 review — the old ratio threshold, 10, is unreachable against
-- this rule's own measured range, max 0.087). The z-score gate alone is this rule's detection.
update public.security_rules set
  logic_type = 'z-score',
  logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte"}',
  threshold = '{"default": 2.5}',
  updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';

-- supabase/schema-security-rules-phase1d.sql — see the file for full comments/reasoning
update public.security_rules
set logic_expression = logic_expression || '{"min_denominator": 250}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id in ('CASH-001', 'CASH-003', 'CASH-004');

update public.security_rules
set logic_expression = logic_expression || '{"min_denominator": 25}'::jsonb,
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-002';
```

(The full files also update each rule's `description` with the measured reasoning — omitted here
for brevity; run the actual files, this block is a preview, not a substitute.)

After running: `INV-001`/`INV-002` stay `active = false` until a deliberate reactivation decision
(they were deactivated as a stopgap ahead of this dispatch). `CASH-001..004` are already
`active = true` and will pick up both the new floors and (unlike the INV rules) remain on
`logic_type: 'ratio'` — they are NOT converted to z-score by this dispatch, only floor-protected.
The real check per dispatch #42 §6 is a live `workflow_dispatch` re-run and a re-query of the
flagged-count distribution once the SQL is applied.
