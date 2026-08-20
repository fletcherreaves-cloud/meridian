# Dispatch #42 — Security build: make detection baseline-relative, and calibrate from measured data

**Board (2026-08-20):** Phase 1/1b (dispatches #39/#40, PR #473) is merged and **live** — all three
schema files run against production, and the batch job has completed one real
`workflow_dispatch` run (`10330 finding(s) upserted across 6 rule(s), 0 error(s)`). This dispatch
acts on what that first real run actually produced. Nothing here is speculative: every number
below is measured from live `security_findings`, not guessed.

**Read before starting:** `memory/dispatch39-phase1-cash-rules.md` and
`memory/dispatch40-inventory-tva-rule.md` (what's already built — do not rebuild any of it);
`memory/plan-security-loss-prevention.md` §1 principles 1–2 (exposure normalization + the
four-baseline design this dispatch finally wires into detection).

---

## The measured evidence — first live run, 2026-08-20

```
rule_id  findings  null_value  flagged   min   median     p95        max
INV-001     5165        167      2603   0.00    21.25    176.12   36234.38
INV-002     5165          0         0   0.00     0.00      0.02       0.13
CASH-001..004: 0 rows in window -> 0 findings (see "Not in this dispatch")
```

Three distinct findings fall out of this, in increasing order of importance.

## Finding 1 — both thresholds are miscalibrated, in opposite directions

- **INV-001** (`threshold: 20`): the median is **21.25**, so the threshold sits *below the median*
  of its own distribution — it flags **2603 of 5165 (50.4%)**. A rule that flags half of everything
  carries no information.
- **INV-002** (`threshold: 10`): the **maximum across all 5165 findings is 0.13** — the threshold
  is ~77× the single most extreme observation, so it can never fire. **This is not a broken join**
  — `null_value: 0` proves the `qsr_fob` cross-table join is working and producing real
  denominators for every row. The metric shape is also correct and idiomatic (item variance per
  $1,000 of store sales is this org's own documented per-thousand convention); only the constant
  is wrong.

**Do not simply hardcode p95.** Both numbers should be set from a *target investigation volume*,
not a percentile picked for looking reasonable — 5% of 5165 is ~258 findings per run, far more
than anyone will review. Calibrate against what a human queue can actually absorb (a few dozen per
run is a defensible starting point), using the real distribution:

```sql
select rule_id,
       percentile_cont(0.99) within group (order by value) as p99,
       percentile_cont(0.995) within group (order by value) as p995,
       count(*) filter (where value >= <candidate>) as would_flag
from public.security_findings
where value is not null
group by rule_id;
```

State the chosen number **and the volume it produces** in the rule row's own `description`, so the
next person doesn't have to re-derive why it is what it is.

## Finding 2 — INV-001 needs a minimum-exposure floor

`max_val: 36234.38` against a p95 of 176 is not a real 36,234% variance — it's a near-zero
`exp_usage` denominator producing a garbage ratio. A percentage rule over a tiny denominator is
noise by construction, and it will dominate any ranked view of the output.

Add a minimum-exposure gate: below some `exp_usage` floor in the window, the rule returns an
honest `null` (no verdict), never a fabricated pass or fail. This is the same discipline
`evaluateRule()` already applies for a zero denominator (`'no exposure (zero denominator) in
window'`) — this just raises that bar from "literally zero" to "too small to be meaningful."
Pick the floor from the same measured distribution, and say what it is in the rule description.

The existing **167 nulls are correct and should stay null** — those are items with zero expected
usage, the honest-null contract already working as designed. Don't "fix" them.

## Finding 3 — the important one: `baseline_type` does not currently drive detection

Both INV rules declare `baseline_type: 'store'`, and `scripts/security-rules-run.mjs` dutifully
computes a real store baseline and persists it into `security_findings.baseline_context`. **But
`evaluateRule()` never reads it.** Its verdict is literally `cmp(value, threshold)`
(`src/engine/security-rules.js:104-106`) — a flat absolute comparison. The baseline is stored and
then ignored for pass/fail.

The consequence is not cosmetic. Today these rules answer *"is this item's absolute variance rate
high?"* — so an item that is inherently hard to count (or inherently high-variance everywhere)
flags at **all 27 stores, every single run**, forever. That is exactly the noise floor that makes
investigators stop reading a system (plan §1's opening argument). What the plan actually specifies
(§1 principle 2) is *"is **this store** unusual **for this item** versus comparable stores"* — a
baseline-relative question. No amount of threshold tuning gets there; it only moves where the
noise sits.

`z-score` has been a declared-but-stubbed `LOGIC_TYPE` since dispatch #36
(`{implemented:false, pass:null}`, never thrown, deliberately deferred to Phase 2). **This
dispatch implements it.** That is the change that turns this from a static threshold alarm into
the detection system the plan describes.

### Design spec for the `z-score` LOGIC_TYPE

- **Getting the baseline to the evaluator.** `evaluateRule(rule, dataContext, { loc })` gains an
  optional `baseline` in its existing options object — `{ loc, baseline }`. Additive and
  backward-compatible: every current caller that omits it keeps working unchanged, and the
  `threshold`/`ratio` branches ignore it entirely.
- **Both callers must be reordered.** `computeFindingsForRule` (`security-rules-run.mjs:137-146`)
  and `computeItemFindingsForRule` (`:231-243`) currently call `evaluateRule()` **first** and
  compute the baseline **after**, purely for context. For a z-score rule the baseline is an
  *input*, so it must be computed first and passed in. This is a real ordering change in both
  functions, not a drop-in.
- **The computation:** `z = (value - baseline.mean) / baseline.stdev`, compared against the rule's
  `threshold` — which for this `LOGIC_TYPE` means **sigma**, not a rate. Document that in the rule
  row's `description`; a `{"default": 2.5}` on a z-score rule means something completely different
  than the same value on a ratio rule, and that is exactly the kind of ambiguity that silently
  produces wrong verdicts.
- **Honest nulls, matching the existing contract — never fabricate a verdict:**
  - `baseline.stdev === 0` → `pass: null` with a reason. Every peer is identical; the comparison
    carries no information, and dividing by it yields `Infinity`/`NaN`, which must never reach a
    stored finding.
  - `baseline.n < MIN_BASELINE_N` → `pass: null` with a reason. A z-score against two other stores
    is not a meaningful signal. Pick a real minimum and state it.
  - `baseline` absent entirely (a z-score rule whose `baseline_type` is `'none'`, or a caller that
    didn't pass one) → `pass: null`, never a crash and never a silent `false`.
- **Keep an absolute materiality floor alongside the z-score.** "Unusual versus peers" is not
  sufficient on its own: a store 3σ above its peers on an item representing $4 of variance is
  statistically interesting and operationally worthless. Add an optional floor to the z-score
  rule's `logic_expression` (e.g. a `min_value`) that the value must also clear before the rule
  can flag, regardless of z. Real detection systems gate on **both** unusualness and materiality;
  this is the mechanism for the second half.

## What to do with INV-001 / INV-002 once z-score exists

Convert both to `logic_type: 'z-score'` against their existing `store` baseline (the baseline
population is already correct — `storeBaseline()` pre-filtered to the same `wrin`, so it compares
this store's rate for item X against other stores' rate for that *same* item X, never pooled
across unrelated items). Their current ratio computation becomes the *value* the z-score is taken
over — the numerator/denominator work in `fieldsFromExpr()` is unchanged and still needed.

Keep the recalibrated absolute thresholds from Finding 1 as the materiality floor described above,
rather than discarding that work — the two mechanisms are complementary, not alternatives.

## Verification approach

- Unit-test the z-score branch against fixtures the same way `security-rules.test.js` already
  covers `threshold`/`ratio`: a clearly-unusual subject flags, a typical one doesn't, and **each
  honest-null path returns `pass: null` with its reason** (zero stdev, insufficient n, absent
  baseline) rather than a fabricated boolean.
- **Test the reordering at the call site, not just the engine** — per this repo's standing rule
  (`#366`: a test that only imports the engine can't tell "fixed" from "fixed but never wired
  in"). At least one test must go through `computeFindingsForRule`/`computeItemFindingsForRule`
  and assert the baseline actually reached the verdict, so deleting the wiring fails the suite.
- **The real calibration check is a live re-run**, not a fixture: after the thresholds change,
  trigger `security-rules-run.yml` via `workflow_dispatch` and re-run the distribution query. The
  flagged counts should land near the intended volume. Anything near 50% or near 0 means the
  calibration didn't take.

## Explicitly not in this dispatch

- **The cash rules' zero-row problem.** `CASH-001`–`CASH-004` returned 0 findings because
  `audit_rows`' newest data is 2026-06-30 while the rules use a 28-day rolling window — the
  Register Audit pull has been failing since the 403 diagnosed 2026-08-20
  (`memory/dispatch35-register-audit-implementation.md`). The rules are correct; they have nothing
  to read. **That is a data-pipeline blocker, not a rules problem, and fixing it is out of scope
  here** — but it currently makes half of Phase 1 inert, so it outranks this dispatch in priority.
- Composite/multi-rule scoring, recurrence decay, opportunity-adjusted risk (Phase 2 proper).
- The sequence engine and change-point detection (Phase 3).
- Any UI — a findings-viewer panel is still the recommended next *feature* dispatch, and is more
  valuable once this dispatch makes the findings worth looking at.
- `sequence`/`window-function` LOGIC_TYPEs — still stubbed, still Phase 3. Only `z-score` is
  implemented here.
