# Dispatch #42 — Make security detection baseline-relative (and calibrate only what's calibratable)

**Board (2026-08-20):** Phase 1/1b (dispatches #39/#40, PR #473) is merged and **live** — all three
schema files run against production, and the batch job completed a real `workflow_dispatch` run:
`10330 finding(s) upserted across 6 rule(s), 0 error(s)`. This dispatch acts on what that run
actually produced. Every number below is measured from live `security_findings`, not guessed.

**Read before starting, in this order:**
1. `memory/analysis-inventory-variance-baseline-2026-08-20.md` — **read this first.** It is the
   business evaluation of the same run and it is what sets this dispatch's ordering. Without it,
   §3 below reads like arbitrary sequencing.
2. `memory/dispatch39-phase1-cash-rules.md` + `memory/dispatch40-inventory-tva-rule.md` — what's
   already built. Do not rebuild any of it.
3. `memory/plan-security-loss-prevention.md` §1 principles 1–2.

> **Revision note (2026-08-20, before this was dispatched to anyone):** an earlier draft of this
> file led with threshold recalibration and treated the z-score work as the third item. That
> ordering was wrong and is corrected below — see §3 for why. Nothing was built against the old
> ordering; this is a pre-dispatch correction, not a mid-flight change.

---

## 1. The measured evidence

```
rule_id  findings  null_value  flagged   min   median     p95        max
INV-001     5165        167      2603   0.00    21.25    176.12   36234.38
INV-002     5165          0         0   0.00     0.00      0.02       0.13
CASH-001..004: 0 rows in window -> 0 findings (see §7)
```

## 2. Step 0 — ✅ ALREADY ANSWERED (owner-run, 2026-08-20). Do not re-run; start at §3.

The item-concentration query was run against live `security_findings`. **The answer is
decisively "uniform / bent ruler" — the 21.25% median is dominated by systematic measurement
error, not operational loss.** Full evidence and the item list:
`memory/project-inventory-data-hygiene-2026-08-20.md`. The headline:

```
BREADED CHICKEN BREAST STRIP     median  798.67%   (39 store-periods)
PIE CTN/BKD/APL/McCAFE                   385.34%   (46)
MINUTE MAID FRUIT PUNCH BIB              278.93%   (28)
COFFEE/DECAF/PREM BLEND/2.25Z            214.39%   (108 = all 27 stores x 4 periods)
MUSTARD/BULK                             151.10%   (108)
FD DRAGONFRUIT PIECES                    145.60%   (108)
...
```

Three things make this conclusive: the list is a catalogue of **hard-to-count or
unit-ambiguous** items (bag-in-box syrups, FCB mixes, bulk condiments, sprinkle-quantity
freeze-dried toppings) plus **packaging in mid-promo transition** (`BIG MAC CRTN/2026 SUMMER
BRAND`, `10PC NGT/2026 SUMMER BRAND REL`); the **magnitudes are impossible as shrink** (798% =
actual usage ~8× expected, which is a unit-of-measure or recipe-coefficient error, not theft);
and these are **medians across essentially the whole estate** — many at all 27 stores, every
period. An operational problem concentrates; this does the opposite.

### What that changes in this dispatch

- **§3 (z-score) proceeds exactly as written, and is now the *entire* detection mechanism.** It
  is also *validated* by this result: if an item reads ~800% at every store, a store reading 800%
  is unremarkable and one reading 1,600% genuinely stands out. Subtracting a common systematic
  offset is precisely what a peer-relative comparison does.
- **§4 (threshold work) is now explicitly the minimal path** — set both as permissive materiality
  floors, do **not** invest in precise calibration. See §4.
- **§5 (exposure floor) matters more, not less** — part of this effect is genuinely low-volume
  items (decaf coffee, dragonfruit pieces) where a small absolute count delta is a huge
  percentage. The floor is what separates "recipe mapping is broken" from "this item is just
  tiny."

**A caveat to carry, not to resolve here:** "predominantly measurement error" is not "entirely
measurement error." Real loss can hide inside a noisy signal. That is an argument for fixing the
measurement (see the data-hygiene file) and for the z-score, **not** for concluding there is
nothing to find.

## 3. The main deliverable — implement the `z-score` LOGIC_TYPE

**Why this is first, and not the threshold work:** a z-score compares *this store's* rate for item
X against *other stores'* rate for that **same** item X. If `exp_usage` is systematically wrong
for item X, it is wrong for all 27 stores in the same direction — so the peer comparison
**cancels the systematic bias out**. An absolute threshold does not; it inherits the bias whole.
That makes the z-score robust to whichever way Step 0 resolves, while absolute-threshold tuning is
entirely contingent on it. This is the single change that turns the build from a static threshold
alarm into the detection system `plan-security-loss-prevention.md` §1 principle 2 actually
describes.

**The gap being closed:** both INV rules declare `baseline_type: 'store'`, and
`scripts/security-rules-run.mjs` computes a real store baseline and persists it into
`security_findings.baseline_context` — but **`evaluateRule()` never reads it.** Its verdict is
literally `cmp(value, threshold)` (`src/engine/security-rules.js:104-106`). The baseline is
computed, stored, and ignored. Consequence: an inherently high-variance item flags at **all 27
stores, every run, forever** — the exact noise floor plan §1 opens by warning against.

`z-score` has been declared-but-stubbed since dispatch #36 (`{implemented:false, pass:null}`,
never thrown, deliberately deferred). Implement it now.

### Design spec

- **Getting the baseline to the evaluator.** `evaluateRule(rule, dataContext, { loc })` gains an
  optional `baseline` in its existing options object — `{ loc, baseline }`. Additive and
  backward-compatible: existing callers that omit it keep working, and the `threshold`/`ratio`
  branches ignore it entirely.
- **Both call sites need reordering — this is the easy thing to miss.**
  `computeFindingsForRule` (`security-rules-run.mjs:137-146`) and `computeItemFindingsForRule`
  (`:231-243`) currently call `evaluateRule()` **first** and compute the baseline **after**,
  because today it's only context. For a z-score rule the baseline is an *input*. Both must
  compute the baseline first and pass it in.
- **The computation:** `z = (value - baseline.mean) / baseline.stdev`, compared against the rule's
  `threshold` — which for this `LOGIC_TYPE` means **sigma**, not a rate. Document that in each
  rule row's `description`: `{"default": 2.5}` on a z-score rule means something entirely
  different than the same value on a ratio rule, and that ambiguity is exactly how a wrong verdict
  ships silently.
- **Honest nulls, matching the existing contract — never fabricate a verdict:**
  - `baseline.stdev === 0` → `pass: null` + reason. Every peer identical; the comparison carries
    no information and the division yields `Infinity`/`NaN`, which must never reach a stored row.
  - `baseline.n < MIN_BASELINE_N` → `pass: null` + reason. A z-score against two other stores is
    not a signal. Pick a real minimum and state it.
  - `baseline` absent (a z-score rule with `baseline_type: 'none'`, or a caller that didn't pass
    one) → `pass: null`. Never a crash, never a silent `false`.
- **Keep an absolute materiality floor alongside the z-score.** "Unusual versus peers" is not
  sufficient alone: a store 3σ above peers on $4 of variance is statistically interesting and
  operationally worthless. Add an optional `min_value` to the z-score rule's `logic_expression`
  that the value must also clear before flagging, regardless of z. Real detection systems gate on
  **both** unusualness and materiality — this is the second half.

### Converting INV-001 / INV-002

Convert both to `logic_type: 'z-score'` against their existing `store` baseline. The baseline
population is already correct — `storeBaseline()` is pre-filtered to the same `wrin`, so it
compares this store's rate for item X against other stores' rate for that same item X, never
pooled across unrelated items. Their current ratio computation becomes the **value** the z-score
is taken over; the `fieldsFromExpr()` numerator/denominator work is unchanged and still needed.

## 4. Threshold work — MINIMAL PATH, per Step 0's answer (uniform / bent ruler)

The measured problem is real either way: INV-001's threshold (20) sits **below its own median**
(21.25), flagging 50.4% of everything; INV-002's (10) is **~77× its own maximum** (0.13) and can
never fire. Note INV-002 is **not** a broken join — `null_value: 0` proves the `qsr_fob` join
produces real denominators for every row, and the metric shape (item variance per $1,000 of store
sales) is this org's own documented per-thousand convention. Only the constant is wrong.

**Step 0 resolved this to the first branch: do NOT invest in precise absolute calibration.** Set
both thresholds as permissive materiality floors feeding §3's `min_value` gate, and move on —
precision against a known-biased measurement is false precision, and the time is better spent on
§3 and §5. The second branch below is retained only to explain what was ruled out and why.

- ~~**If Step 0 says concentrated:** calibrate properly, from *target investigation volume* rather
  than a percentile chosen for looking reasonable — 5% of 5,165 is ~258 findings per run, far more
  than anyone will review. A few dozen is a defensible starting point:~~ **(ruled out — Step 0
  came back uniform.)** The volume-calibration query is kept here because it becomes the right
  tool again *after* §5's exposure floor lands and the distribution is re-measured on material
  items only:

```sql
select rule_id,
       percentile_cont(0.99)  within group (order by value) as p99,
       percentile_cont(0.995) within group (order by value) as p995,
       count(*) filter (where value >= <candidate>) as would_flag
from public.security_findings
where value is not null
group by rule_id;
```

Either way, state the chosen number **and the volume it produces** in the rule's own
`description`, so nobody re-derives it later.

## 5. INV-001's minimum-exposure floor — do this regardless of Step 0

`max_val: 36234.38` against a p95 of 176 is not a real 36,234% variance — it's a near-zero
`exp_usage` denominator producing a garbage ratio. Below an `exp_usage` floor, the rule returns an
honest `null` (no verdict), never a fabricated pass or fail — the same discipline `evaluateRule()`
already applies for a zero denominator, just raising the bar from "literally zero" to "too small
to mean anything."

**This is not merely noise-suppression — it is a prerequisite for measurement.** Per the analysis
file, low-volume items structurally inflate percentages (4 units expected, 1 unit difference =
25%), and with ~190–200 non-condiment items per store the long tail likely dominates the median.
The floor is what makes the 21.25% figure interpretable at all, which is why it's unconditional
and why Step 0's queries are more trustworthy re-run after it lands.

The existing **167 nulls are correct and stay** — items with zero expected usage, the honest-null
contract working as designed. Don't "fix" them.

## 6. Verification approach

- Unit-test the z-score branch the way `security-rules.test.js` already covers `threshold`/`ratio`:
  a clearly-unusual subject flags, a typical one doesn't, and **each honest-null path returns
  `pass: null` with its reason** (zero stdev, insufficient n, absent baseline) rather than a
  fabricated boolean.
- **Test the reordering at the call site, not just the engine** — standing rule from `#366`: a
  test that only imports the engine cannot distinguish "fixed" from "fixed but never wired in."
  At least one test must run through `computeFindingsForRule`/`computeItemFindingsForRule` and
  assert the baseline actually reached the verdict, so deleting the wiring fails the suite.
- **The real check is a live re-run**, not a fixture: after landing, trigger
  `security-rules-run.yml` via `workflow_dispatch` and re-run the distribution query. Flagged
  counts should land near the intended volume. Anything near 50% or near 0 means it didn't take.

## 7. Explicitly not in this dispatch

- **The cash rules' zero-row problem.** `CASH-001`–`CASH-004` returned 0 findings because
  `audit_rows` stops at 2026-06-30 against a 28-day rolling window — the Register Audit pull has
  been failing since the 403 diagnosed 2026-08-20
  (`memory/dispatch35-register-audit-implementation.md`). The rules are correct; they have nothing
  to read. **A data-pipeline blocker, not a rules problem** — out of scope here, but it currently
  makes half of Phase 1 inert and outranks this dispatch in business priority. It is not
  dispatchable to an engineer yet: it needs an owner-side look at whether that QSRSoft report page
  requires a UI interaction before it fires its API.
- **`INV-003` (variance unmatched by logged waste)** — plan §2.2's own strongest-named signal,
  buildable today from `raw_waste`/`comp_waste` columns already in `qsr_variance_stat` and already
  loaded by the batch job. Deliberately a separate, later dispatch: it's a new rule, and this one
  is already substantial (engine change + two call-site reorders + floors). See the analysis file.
- Composite/multi-rule scoring, recurrence decay, opportunity-adjusted risk (Phase 2 proper).
- Sequence engine, change-point detection, and the `sequence`/`window-function` LOGIC_TYPEs — all
  still stubbed, still Phase 3. **Only `z-score` is implemented here.**
- Any UI. A findings-viewer panel remains the recommended next *feature* dispatch, and is worth
  more once this dispatch makes the findings worth looking at.
