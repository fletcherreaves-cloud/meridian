---
name: dispatch-44
description: Close the unreachable-threshold defect class. Part A re-expresses CASH-003 as a count rule (measure the unmapped Qty field first, then map/backfill/rewrite) under the owner's stated condition for its deactivation. Part B extends the threshold guard from phase1c's z-score pair to every rule in phase1.sql, so the guard closes the class rather than the one case.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #44 — close the unreachable-threshold class

**Read first:** `memory/finding-unreachable-threshold-class-2026-08-20.md`. It is short and it is
the whole rationale for this dispatch. Do not start from this file alone.

**Context in one line:** three rules shipped with a threshold above their own metric's achievable
range, which makes a rule return a definite **"clear"** for every subject forever while looking
correctly configured. One of the three (CASH-003) was live. This dispatch fixes that rule properly
and extends the guard so instance four cannot ship.

Two independent parts. **Part B is smaller and unblocks nothing — do it first if Part A stalls on
step A1.**

---

## Part A — CASH-003, re-expressed as a count rule

### The owner's condition, which is binding

> *"Deactivate CASH-003 > But only on the premise of looking for the unmapped header to add."*

CASH-003 is `active = false` in production. That deactivation was accepted **only** as a stopgap
paired with this work. It is not a retirement, and the condition is written into the rule's own
`description` column so it travels with the row. **Do not close this out by leaving the rule off.**

### What is and is not wrong

**Not wrong:** the field mapping. `manualRefAmt` ← `manOverringAmt` carries real values (measured
max 0.7702 across 636 floor-passing subjects). The owner confirms manual over-rings are genuinely
infrequent, so a `p50`/`p95` of **0.0000** is *correct data*, not a broken column. **Do not "fix"
the mapping** — that hypothesis is already disproven, and re-testing it is wasted effort.

**Wrong:** the instrument. A per-$1,000-sales *rate* cannot express what a rare privileged-override
signal actually is — "how many times, versus peers who mostly never do it at all." On a
95%-zero distribution any positive rate threshold degenerates to "flag anyone who did this once."

### A1 — Measure whether the count field exists (do this before anything else)

`manOverringAmt` is the **only** override category pulled without a `Qty` sibling. Every other one
has both:

```
refundCashQty · mgrMealDiscQty · overringQty · promoQty · tRedBeforeQty · tRedAfterQty · empMealDiscQty
```

and `audit_rows` carries `refund_cnt` / `mgr_meal_cnt` / `pos_over_cnt` / `promo_cnt` /
`t_red_b_cnt` / `t_red_a_cnt` — but **no `manual_ref_cnt`**.

That makes "`manOverringQty` exists in the response and is simply unmapped" a strong hypothesis.
**It is still a hypothesis.** Per CLAUDE.md's standing rule, measure it: one run of
`scripts/qsrsoft-register-audit-pull.mjs` logging `Object.keys(rows[0])`.

> 🔒 **Key names only, never values.** Every row in this response is employee-attributed PII. The
> existing `extractRows()` shape logging is the pattern to follow — it logs keys and array lengths
> and nothing else. Never log `Cookie` / `Authorization` / token values, header names only.

Report what the keys actually are before writing any mapping code. If the field is named something
other than `manOverringQty`, that is a useful finding on its own and this dispatch adapts to it.

### A2 — If the count exists: map, migrate, backfill

1. `mapRow()` in `scripts/qsrsoft-register-audit-pull.mjs` — add `manualRefCnt: num(r.<field>)`,
   following the `posOverCnt: num(r.overringQty)` pattern exactly.
2. `audit_rows` — add `manual_ref_cnt numeric`, matching the other `*_cnt` columns. Both the pull
   script's upsert map and `src/lib/supabase.js`'s two round-trip maps need the new column
   (`manual_ref_cnt` ↔ `manualRefCnt`); there are **four** such sites in total — grep, do not
   assume two.
3. **Backfill.** The pull honours `QSRSOFT_AUDIT_START_DATE` / `_END_DATE`. Per CLAUDE.md's
   standing authorization, a missing window is a work item, not a finding — close it and report
   what you closed. Match the existing `audit_rows` history; do not leave the new column populated
   only forward of today.

### A3 — Re-express the rule

New `logic_expression` on a **count** basis with a **dollar materiality floor**, both derived from
the measured distribution rather than chosen:

- Numerator: `manualRefCnt`, `agg: 'sum'`, over the 28-day window.
- A count threshold ("≥ N manual over-rings in 28 days").
- A dollar materiality gate so N trivial corrections do not flag.
- Keep `min_denominator: 250` on `drawerSales` — the exposure floor is still correct and still
  measured.

**Measure the count distribution before choosing N.** Report the deciles. The number must come from
data; this dispatch deliberately does not name one, because naming one here is exactly the mistake
that created this defect three times.

If the engine cannot express "count numerator with a dollar side-gate" in the current
`threshold`/`ratio`/`z-score` shapes, say so and propose the smallest engine change that can —
do not contort the rule into a shape that fits but does not mean what it should.

**If A1 finds no count field:** fall back to an absolute-dollar threshold on `manualRefAmt` (not a
rate), sized from its measured distribution. Same discipline, same materiality reasoning.

### A4 — Reactivate

Only after A1–A3. Write the reactivation into the migration, and **replace** the `DEACTIVATED
2026-08-20: …` sentence in the rule's `description` rather than appending after it — note that
`phase1d.sql`'s `regexp_replace` strips from its marker to end-of-string, so ordering matters here.

---

## Part B — extend the threshold guard to close the class

`src/__tests__/security-rules-thresholds.test.js` is good work: it parses the **real seed SQL**
rather than a transcribed copy, and it is mutation-tested. It is also scoped to one third of the
problem — it reads only `schema-security-rules-phase1c.sql` and its `MEASURED_MAX` holds only
`INV-001` / `INV-002`, so it validates `min_value` on **z-score** rules and nothing else.

CASH-003's defect was `threshold` on a **`ratio`** rule in `schema-security-rules-phase1.sql` —
entirely outside the guard's reach.

**Extend it to:**

1. Parse every rule from `schema-security-rules-phase1.sql` and `-phase1b.sql`, not just `phase1c`.
   Note `phase1.sql` uses multi-line `insert … values` rather than `update … set`, so
   `extractLogicExpressions()`'s statement-splitting needs a second shape. Keep the existing
   deliberate simplicity — these migrations are hand-written in consistent shapes — but the
   `description` column contains `''`-escaped apostrophes where `logic_expression` does not, which
   the current parser relies on. Do not break that assumption.
2. Assert **`threshold.default` sits inside the rule's measured range** for ratio/threshold rules,
   the same way `min_value` is asserted for z-score rules.
3. Extend `MEASURED_MAX` to carry a measured ceiling for **every** rule, each with its provenance
   comment (date, population, query shape) in the style already established there.
4. Keep the "not too low either" assertion pattern from the INV-001 case where a meaningful one
   exists — a floor that gates nothing is the other failure direction and is also worth catching.

**Verification bar:** mutation-test it, as the original was. Set CASH-001's threshold to something
unreachable and confirm the suite fails; restore and confirm it passes. A guard nobody has watched
fail is not yet a guard.

---

## Out of scope — deliberately

- **Reactivating INV-001 / INV-002.** They are z-score now but have never *run* in that mode, so
  nobody knows what they produce. That is a separate dispatch and it needs a dry run first.
- **Dispatch #43 Phase 2** (triage state, persisted verdicts).
- **`INV-003`** — variance unmatched by logged waste, the plan's own strongest named signal, still
  unused despite `raw_waste`/`comp_waste` already being loaded on every run.
- **The 30 broken-`exp_usage` WRINs** — mostly QSRSoft configuration, not Meridian code.

## Standing rules that bite specifically here

- **Measure, don't reason** — A1 exists because "the field is obviously unmapped" is a hypothesis,
  and this repo has a documented history of confidently wrong diagnoses that a single real query
  would have refuted.
- **Would this verification still pass if the change were reverted?** Part B's mutation test is
  that rule applied to a guard rather than a feature.
- **Commit every `memory/` file you create or edit in the same commit as the work that cites it.**
- **A commit body is the durable handoff** — spell out what was deferred and why, especially the
  measured distributions behind whatever N and dollar floor you land on.
