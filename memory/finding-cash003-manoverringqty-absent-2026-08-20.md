---
name: finding-cash003-manoverringqty-absent-2026-08-20
description: Measured negative result. manOverringQty does not exist in the Register Audit API response - 0 of 19,985 backfilled rows carry a value. CASH-003's count-rule redesign assumed that field name by pattern-matching; the assumption is now disproven and the rule is blocked on finding the real field name or establishing there is none. Also records the lifecycle-enrichment reconciliation, where the PM's own 5x claim was measured down to 1.8x.
metadata:
  node_type: memory
  type: finding
---

# CASH-003: the field it was rebuilt on does not exist

**Measured 2026-08-20**, immediately after an 80-day Register Audit backfill (run `32415565305`,
14,528 rows, 27/27 stores, window 2026-06-01 → 2026-08-20).

```
rows_80d  non_null  non_zero  max_cnt  total_cnt
   19985         0         0     null       null
```

**`audit_rows.manual_ref_cnt` is null in every single row.** The column exists (phase1e applied),
the pull ran clean, the mapping line is in `mapRow()` — and `num(r.manOverringQty)` resolves to
nothing, because **the API response has no `manOverringQty` field.**

## Why this matters more than the fix

Dispatch #44 rebuilt CASH-003 around this field. The reasoning was sound: `manOverringAmt` was the
only override category pulled without a Qty sibling, every other one has both (`overringAmt`/
`overringQty`, `refundCashAmt`/`refundCashQty`, `mgrMealDiscAmt`/`mgrMealDiscQty`,
`tRedBeforeAmt`/`tRedBeforeQty`), and `audit_rows` had no `manual_ref_cnt` column while carrying
five other `*_cnt` columns. A textbook inference from a real, consistent pattern.

**It was still wrong.** The dispatch required measuring the field name via a live pull *before*
using it. That step was initially satisfied by pattern-matching instead; the engineer caught this
mid-session, hedged the claim in the code comments and writeup rather than leaving it stated as
fact, and the measurement has now settled it. **The hedge is the reason this is a two-hour
correction rather than a rule that silently scores an empty column forever** — which is precisely
the failure class `finding-unreachable-threshold-class-2026-08-20.md` documents.

## Current state — safe, and deliberately inert

- `CASH-003` is `active = false`, `logic_type: ratio`, numerator `manualRefCnt`, `min_denominator`
  25, **no threshold**. It evaluates nothing (the batch job only fetches `active = true`).
- `audit_rows.manual_ref_cnt` exists and is uniformly null. Harmless.
- Nothing downstream reads it.

## The next step, and its constraint

**One diagnostic run logging the response's actual top-level key names** for a single row — the same
shape-only pattern `extractRows()` already uses for the envelope. **Key names ONLY, never values:
every row is employee-attributed PII.**

Three possible outcomes, all actionable:
1. **The count exists under another name** → map it, re-run the backfill, measure the distribution,
   set a threshold, reactivate. The dispatch #44 design is correct and just needs the right field.
2. **No count field exists anywhere in this response** → CASH-003 cannot be a count rule from this
   endpoint. Either find another endpoint carrying it, or accept that manual over-rings are not
   measurable here and retire the rule explicitly rather than leaving it inactive forever.
3. **It exists on a different report** → a new pull, scoped separately.

**Do not guess a second field name.** That is what produced this finding. The response keys are one
run away and cost nothing.

## Related: the lifecycle-enrichment reconciliation (same session)

Two measurements of "how enriched are lifecycle-marked items among INV-001's flags" disagreed. Run
side by side against the same `security_findings`:

| scope | flagged | marked | pct |
|---|---:|---:|---:|
| INV-001 only | 188 | 26 | **13.8%** |
| INV-002 only | 224 | 18 | 8.0% |
| both rules | 412 | 44 | 10.7% |
| population (all rows) | 10,604 | 824 | **7.8%** |

**Resolved, and against the PM.** The PM's 13.8% reproduces exactly, but the PM's *scoping theory*
for the disagreement (INV-001-only vs both-rules) is wrong — "both rules" is 10.7%, not the
engineer's 2.5%. And the PM's stated *"roughly 5× enrichment"* was never measured: the population
rate is **7.8%**, so true enrichment is **~1.8×**. Real, modest, and much weaker than claimed.

**Still unreconciled:** the engineer measured the population marked-rate at 2.6% (136 of 5,320)
against this 7.8% (824 of 10,604 = 412 of 5,302 items) — a 3× gap in the *same* quantity. Likeliest
cause is differing `ILIKE` patterns or join shape; note this query's `item` CTE takes
`max(descr)` per `(loc, wrin)`, which collapses an item marked `(New)` in one period and unmarked in
another. Worth settling if lifecycle routing is ever prioritized above Part C; not worth it before.

**Consequence for dispatch #46 Part B:** unchanged. It was already scoped as ~14% of the queue and
explicitly "not the fix." The 1.8× enrichment justifies routing these items but not prioritizing
that work over Part C's unexplained 162.
