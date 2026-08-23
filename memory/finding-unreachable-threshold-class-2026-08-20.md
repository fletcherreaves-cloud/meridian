---
name: finding-unreachable-threshold-class-2026-08-20
description: Three security rules shipped with a threshold above their own achievable range, making them silently incapable of firing while looking correctly configured. CASH-003 was live and returning unearned "clear" verdicts for 636 subjects. Records the class, why it recurs, the one guard that exists and the gap in it, and the open work to close both.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The unreachable-threshold defect class

**Found 2026-08-20, three instances in one day.** A rule whose threshold sits above the maximum its
own metric can produce is indistinguishable, from outside, from a rule that is working and finding
nothing. It reports `pass: false` — a definite **"clear"** — for every subject, forever.

This is worse than a false positive and it is the reason it went unnoticed: **a false alarm gets
investigated; a false all-clear gets trusted.** With the Security panel (dispatch #43) now
rendering passed rules beside failed ones as exoneration evidence, an un-fireable rule's "clear"
became *visible* — it reads as one of four cash signals coming back clean on an employee when in
fact one of the four never looked.

## The three instances

| rule | threshold | measured max | ratio | state when found |
|---|---:|---:|---:|---|
| INV-002 | 10 | 0.0868 | 115× | `active=false` — caught in PR #481 review, pre-merge |
| CASH-003 | 8 | 0.7702 | 10× | **`active=true`, live, 636 unearned clears/night** |
| INV-001 | 20 | 21.25 median | — | near-miss; clears ~half, genuinely permissive |

INV-001 is included deliberately. The same "carry the old threshold forward" policy produced all
three; it happened to land inside the range for INV-001 and outside it for the other two. A policy
that is correct by luck on one rule is not a correct policy.

## Why it recurs

1. **A threshold and its metric are configured in different places.** The number lives in
   `security_rules.threshold` (SQL); the range it must sit inside is a property of live data
   nobody re-queries when copying a rule.
2. **Carrying a number forward feels conservative.** Reusing dispatch #40's ratio thresholds as
   materiality floors *looked* like the cautious choice. For INV-002 it silently disabled the rule.
3. **Zero findings looks like good news.** CASH-003's 0-of-670 sat in the first cash run's output
   next to three believable rates and read as "no refund abuse," which is a pleasant conclusion and
   therefore the one least likely to be challenged.
4. **The engine cannot detect it.** A value that never clears a floor is structurally identical to
   a value that is genuinely never large enough. Only a comparison against measured range finds it.

## The guard — and its gap

`src/__tests__/security-rules-thresholds.test.js` (PR #481) parses the **real seed SQL** — not a
transcribed copy — and fails if a z-score rule's `min_value` exceeds a recorded measured ceiling.
Mutation-tested: reintroducing `min_value: 10` on INV-002 fails two assertions.

**It covers one of the three shapes.** It reads only `schema-security-rules-phase1c.sql`, and
`MEASURED_MAX` holds only `INV-001`/`INV-002`. CASH-003's defect is `threshold` on a `ratio` rule
in `schema-security-rules-phase1.sql` — entirely outside its scope. The guard closes the *case*,
not the *class*.

**Open work item:** extend it to parse `threshold` for every rule in `phase1.sql`, and assert each
sits inside that rule's own measured range. Small, mechanical, and it is what stops instance four.

## CASH-003 specifically — deactivated, NOT retired

Owner-stated condition (2026-08-20): *"Deactivate CASH-003 > But only on the premise of looking for
the unmapped header to add."* The deactivation is a stopgap tied to a fix, not a quiet retirement.

The rate framing is the wrong instrument, not a number needing a nudge. `p50` and `p95` are both
**0.0000** across 636 floor-passing subjects, and the owner confirms manual over-rings are
genuinely infrequent — so that distribution is **correct data**, not a mapping failure (a real
non-zero max of 0.77 confirms the field is populated). A per-$1,000 rate cannot express "how many
times, versus peers who mostly never do it," which is what a rare privileged-override signal is.

**`manOverringAmt` is the only override category pulled without its `Qty` sibling.** Every other
one has both — `refundCashQty`, `mgrMealDiscQty`, `overringQty`, `promoQty`, `tRedBeforeQty`,
`tRedAfterQty`, `empMealDiscQty` — and `audit_rows` carries `refund_cnt` / `mgr_meal_cnt` /
`pos_over_cnt` / `promo_cnt` / `t_red_b_cnt` / `t_red_a_cnt` but **no `manual_ref_cnt`**.

Work, in order:

1. **Measure, don't assume:** confirm whether `manOverringQty` exists in the Register Audit
   response. One run logging `Object.keys(rows[0])` — **key names only, never values**; every row
   is employee-attributed PII.
2. If present: map it, add `manual_ref_cnt` to `audit_rows`, backfill (the pull honours
   `QSRSOFT_AUDIT_START_DATE`, so history comes with it — a gap is a work item, not a finding).
3. Re-express CASH-003 as a **count rule with a dollar materiality floor** — "≥N manual over-rings
   in 28 days AND ≥$X" — derived from the measured distribution. Explainable to a GM, which the
   rate never was. If the count does not exist, fall back to a dollar threshold on `manualRefAmt`
   sized from real data.
4. **Reactivate only after 1–3.** The condition is written into the rule's own `description` in
   production, so it travels with the row.

## The standing lesson

**Before shipping a threshold, compare it to the range of the thing it gates.** One query. It is
the same discipline as CLAUDE.md's "measure it, don't reason about it," applied to configuration
rather than code — and configuration is where it had no guard at all.

Corollary, learned the hard way in the same day: **when a rule produces zero findings, that is a
question, not a result.** Ask whether it *can* fire before concluding there is nothing to find.
