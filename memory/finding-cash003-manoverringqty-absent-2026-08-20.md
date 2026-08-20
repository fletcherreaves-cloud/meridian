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

## ✅ RESOLVED, same day — CASH-003 is LIVE, as an absolute dollar rule

**The count does not exist anywhere.** Three independent confirmations: the API response carries no
`manOverringQty` (0 of 19,985 rows), `parseRegisterAudit`'s Excel header search finds only the `$`
column, and the owner checked the Register Audit report in the QSRSoft UI directly — **no manual
over-ring count column exists.** Outcome 2 above, settled. The diagnostic run was never needed.

**But retirement was the wrong conclusion, and nearly the one taken.** The dollar field works —
`manualRefAmt` carries real data. The event is simply rare. Measured over the 80-day backfill:

```
rows_80d  any_dollars  subjects  smallest  median_nonzero  largest  total
   19985            6         4     $7.00          $10.00   $26.00    $70
```

**Six occurrences, four employees, 80 days, 27 stores.** No sub-dollar amounts at all — so the
"trivially gameable by rounding" objection that killed the rate version has no basis in the actual
data. That objection was about a *rate*; it dissolves once the denominator is dropped.

**For an event this rare, both a rate and a count are the wrong instrument — an absolute dollar
threshold is right.** If essentially nobody does this, any occurrence above trivial IS the outlier,
and no distribution is needed to rank against. The engine already supported this directly:
`logic_type: 'threshold'`, field `manualRefAmt`, **no denominator** (so no exposure floor applies).
No new field, no new pull, no `manual_ref_cnt`.

Shipped config: `threshold: 5` — below the smallest observed occurrence ($7), so it captures every
real event while excluding rounding noise. **`active = true`, legitimately, for the first time.**

**Why the rule is worth having despite $70.** The dollar total is not the signal and should never be
quoted as one. A manual over-ring is a *privileged override*: the question is whether it was
authorized, never whether $10 matters. A flag means **"verify this override was approved."** Expect
one or two subjects per 28-day window — **the first rule in this build whose output is small enough
to review exhaustively**, against INV-001's 188.

**⚠️ Outstanding for the engineer:** `security-rules-thresholds.test.js` deliberately excluded
CASH-003 from `MEASURED_MAX` because it had no measured range. It has one now (window-summed, so
above the $26 single-event maximum). **Add the entry or the guard silently skips the very rule it
was built in response to.**

## The standing lesson, sharpened

The first instinct on a rule that cannot fire is to find the missing data. The second is to retire
it. **Both were wrong here — the right move was to change the instrument.** A rate needs a
distribution; a count needs a count field; an absolute threshold needs neither, and for a rare event
it is the *more* honest measure, because the interesting fact is that the event happened at all.
Ask what shape the event actually has before assuming the rule needs different data.

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
