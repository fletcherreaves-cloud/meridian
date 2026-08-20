---
name: dispatch-45
description: Three parts from the z-score dry run. A adds min_numerator to the engine so a rule can gate on absolute dollars, not just a rate (INV-002 currently flags 224 financially trivial subjects for want of it). B routes lifecycle-marked items to a hygiene classification instead of the security queue. C is the real open question - characterise the 162 unmarked flags at ~101% median variance that neither bias-cancellation nor lifecycle explains.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #45 — what the z-score dry run left open

**Read first:** `memory/analysis-zscore-dry-run-2026-08-20.md`. It has the measured numbers, and it
records a PM hypothesis that was raised and refuted within the hour — do not resurrect it.

**Context:** INV-001/INV-002 ran as z-score rules for the first time (run `32408929106`). The peer
baseline cancelled the estate-wide bias decisively — max stores flagged per WRIN went **27 → 3**,
INV-001's flag rate **50.4% → 4.1%**. The conversion is validated. What remains is three things it
exposed.

Parts A and B are well-scoped. **Part C is the one that matters**, and it is investigation, not
implementation — do not skip it because A and B are more satisfying to build.

---

## Part A — `min_numerator`: let a rule gate on absolute magnitude

**The gap.** INV-002 flags **224 subjects** on pure 2.5σ with no materiality gate. Its `min_value`
was removed in PR #481 because the inherited value (10) was unreachable — correct — but that left
nothing. Scale: max rate **0.09 per $1,000 sales** against a measured minimum `storeMonthSales` of
$2.1M, so the largest flagged variance is a few hundred dollars and the median a few tens.

**Why this is an engine gap, not a config one.** `min_value` gates the computed **rate**. The right
floor for INV-002 is an absolute-dollar threshold on the **numerator** (`sum(|dolDiff|)`), which no
current key can express. This is dispatch #42 §3's own stated case — *"a store 3σ above peers on $4
of variance is statistically interesting and operationally worthless"* — with no mechanism behind it.

**⚠️ A SECOND, INDEPENDENT CAUSE — found 2026-08-20 in the live panel, fix both or neither.** The
panel rendered INV-002 on item `10195-005` / store `35064` as:

```
Dollar-variance rate vs. store sales
0.04 vs threshold 2.50 -- store: mean 0.00, stdev 0.00, n 26        Flagged
```

`evaluateZScoreRule()` guards `if (!baseline.stdev)` -- which catches **exactly** zero, not 0.0001.
Had stdev been truly zero the verdict would be an honest null rendering as "Undetermined." It
rendered **Flagged**, so stdev is non-zero and merely *rounds* to 0.00, and `z = (0.04 - ~0) / ~0`
explodes. **A peer population clustered at near-zero turns any non-zero value into a massive
outlier.** This is a degenerate-baseline defect, not a materiality one, and `min_numerator` alone
will NOT fix it -- a subject can clear a dollar floor and still be scored against a meaningless
sigma.

Add a **relative** guard beside the existing absolute one: reject a baseline whose stdev is
negligible against its own mean (a coefficient-of-variation floor), or whose stdev is below a
per-rule `min_stdev`. Honest null, same as the `n < MIN_BASELINE_N` case -- the population genuinely
cannot support a z-score. **Measure the stdev distribution across live baselines before choosing the
form or the number**; do not pick a constant from intuition.

**Build `min_numerator` exactly like `min_denominator`:** per-rule data inside `logic_expression`, never an engine
constant, applied at the **one shared choke point** `evalRatio`/`evalThreshold` already use. Note the
asymmetry and honour it:

- **`min_denominator` unmet → honest null.** Not enough exposure to form a verdict.
- **`min_numerator` unmet → `pass: false`, a real "clear."** The rule *did* evaluate; the subject is
  genuinely below materiality. This mirrors how `min_value` already behaves in
  `evaluateZScoreRule()` and the distinction is deliberate — do not collapse them.

Then set INV-002's floor **from the measured `sum(|dol_diff|)` distribution** (report the deciles),
and reactivate it. **Name no number before measuring** — a threshold above its own achievable range
is this build's most-repeated defect (`finding-unreachable-threshold-class-2026-08-20.md`), and
Part A of dispatch #44 exists because of it.

**INV-002 should go back to `active = false` until this lands.** It is currently emitting 224
meaningless flags into a live panel.

## Part B — route lifecycle-marked items out of the security queue

`qsr_variance_stat.descr` carries machine-readable lifecycle markers — `(Deactivated)`, `(New)`,
`(Obsolete NN days left` — in a column the batch job already loads, entirely unused. Measured share
of INV-001's 188 flags:

| lifecycle | flagged | share | median var % |
|---|---:|---:|---:|
| no marker | 162 | 86.2% | 100.9 |
| deactivated | 22 | 11.7% | 192.6 |
| new | 2 | 1.1% | 663.7 |
| obsolete | 2 | 1.1% | 354.8 |

**Scope this honestly: it is 13.8% of the queue, not a fix.** An earlier PM reading called lifecycle
the dominant explanation, from a top-20 sorted by magnitude — where marked items cluster (medians
193–664% vs 101%). The analysis file records why that was wrong.

**Route, do not suppress.** A deactivated WRIN at 193% variance is a genuine work item — it is just a
*data-hygiene* item, not a *security* one. Deleting it discards real signal. Add a classification
(a `category` on the finding, or an equivalent) so the Security panel can separate "investigate this
person/item" from "fix this item's setup," and the hygiene set stays visible rather than vanishing.

Coordinate with dispatch #43's panel: it groups by subject and renders passed rules as exoneration.
A hygiene-classified finding must not read as either a security flag or an exoneration.

## Part C — characterise the 162 (the actual open question)

**162 flags on ordinary, active, unmarked items at a 100.9% median variance** — actual usage running
about twice expected. Explained by none of what we know:

- **Not estate-wide mis-mapping** — the peer baseline cancels a shared offset, and max stores per
  WRIN is 3.
- **Not item lifecycle** — measured at 13.8%, above.
- **Not plausibly shrink** — 2× expected usage is not a theft rate.

So something real is producing store-specific, item-specific deviation at large magnitudes, and
**nobody knows what.** Until that has an answer, `exp_usage` should not be trusted as a *detection*
input, and no further inventory rule should be built on it.

**This is investigation, and the deliverable is a memory file, not code.** Angles worth measuring —
not a checklist to complete, and the right next question may be none of these:

1. **Do the 162 concentrate by store?** A few stores producing most of them points at counting
   practice or a training issue at those locations — an operational finding, and the first one this
   build would have produced.
2. **Do they concentrate by `cls` (food vs paper) or by item family?** Bulk liquids and
   partial-container items were already suspected in the 30-WRIN work.
3. **Do they recur period-over-period for the same (loc, wrin)?** A persistent deviation is a setup
   or practice issue; a one-period spike is an event (delivery posting, a count timing error).
4. **What does `raw_waste`/`comp_waste` say for those same subjects?** Variance matched by logged
   waste is largely explained. This is also the plan's own strongest named signal and is still
   entirely unused — see the `INV-003` note below.

**Report what the data says, including "still unexplained."** An honest null result here is worth
more than a theory, and this build has already paid twice for confident readings that a query
refuted.

---

## Out of scope — deliberately

- **`INV-003`** (variance unmatched by logged waste). Part C question 4 will touch `raw_waste` /
  `comp_waste` diagnostically; building the rule is separate work and should wait for C's answer.
- **Dispatch #44** — CASH-003's count rule and the threshold-guard extension. Independent; either
  order.
- **Dispatch #43 Phase 2** (triage state).
- **The 30-WRIN QSRSoft config work** — upstream of Meridian, owner-side.

## Standing rules that bite specifically here

- **Any query joining `security_findings` to `qsr_variance_stat` must join on `period` too, or
  pre-aggregate the item lookup.** That table's PK is `(loc, period, wrin)`; a `(loc, wrin)`-only
  join fans out ~3.5× and inflates every count. This has now recurred **three times**, most recently
  hours after being written down. `count(distinct ...)` and medians are unaffected.
- **A sorted head is not a sample.** The refuted lifecycle hypothesis came from reading a top-20
  ordered by magnitude.
- **Measure before naming a threshold.** Both Part A's floor and any Part C conclusion.
- **Commit every `memory/` file in the same commit as the work that cites it.**
