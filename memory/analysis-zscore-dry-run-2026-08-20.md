---
name: analysis-zscore-dry-run-2026-08-20
description: First execution of INV-001/INV-002 as z-score rules. The peer baseline cancelled the estate-wide bias decisively (27 stores flagged per broken item -> max 3), cutting INV-001's flag rate from 50.4% to 4.1%. But the survivors are still not shrink, and a PM hypothesis that item lifecycle explained them was refuted by its own data. Also records INV-002 flagging 224 financially trivial subjects for want of a numerator-level materiality gate.
sensitivity: open
metadata:
  node_type: memory
  type: analysis
---

# The z-score dry run (2026-08-20)

INV-001/INV-002 were converted to `logic_type: 'z-score'` in `phase1c.sql` but left `active=false`,
so peer-relative detection had **never executed** against this estate. Owner reactivated both and
dispatched `security-rules-run.yml` manually (run `32408929106`, success) rather than waiting for
the 11:00 UTC schedule. This file records what that run showed.

## The headline: bias cancellation worked

| | flat ratio (first run) | z-score (this run) |
|---|---:|---:|
| INV-001 subjects | 5,165 | 5,302 |
| INV-001 flagged | **2,603 (50.4%)** | **188 (4.1%)** |
| undetermined | 167 | 703 |
| max value | 36,234 | 7,569 |
| **max stores flagged per WRIN** | **27 (all)** | **3** |

The last row is the finding. The signature of the measurement problem
(`project-inventory-data-hygiene-2026-08-20.md`) was that the same items flagged at **every store in
every period** — loss concentrates, measurement error is uniform. After the conversion the maximum
is **3 stores**. A store baseline built from *other stores' rate for the same item* subtracts an
offset they all share, so an estate-wide mis-mapping no longer flags anywhere.

Two independent corroborations that the exposure floor also behaved:
- `undetermined` rose 167 → 703 against a prediction of ~643 (423 measured floor conversions + 220
  already at zero exposure), the remainder being `n < MIN_BASELINE_N` peer populations. Landing
  within ~60 of a number derived from a *separate* measurement is a real check on both.
- `max` collapsed 36,234 → 7,569 — the extreme ratios were near-zero denominators, exactly what
  the floor exists to remove.

**Verdict: the z-score conversion is validated on its own terms.** It did the thing it was premised
on doing.

## But INV-001 is still not a loss-prevention queue

The surviving 188 are **still not plausible as shrink**. Top items by store-count and magnitude run
at 1,429% / 1,062% / 827% median variance — actual usage 8–14× expected, which is a recipe
coefficient or unit-of-measure error, not theft. Roughly six of the top twenty also appear on the
known-broken 30-WRIN list from the same morning.

So the rule moved from "flags the whole estate on mis-mapped items" to "flags two or three stores
on items that are still mostly mis-mapped." Structurally correct, materially not yet usable.

## ⚠️ A PM hypothesis, raised and refuted the same hour — do not resurrect it

The top-20 view showed **8 of 20** items carrying a lifecycle marker in `qsr_variance_stat.descr`
itself — `(Deactivated)`, `(New)`, `(Obsolete NN days left`. The PM proposed that item lifecycle
transition was the dominant remaining explanation and was about to scope a dispatch around it.

**That was wrong, and its own follow-up query refuted it.** Measured (corrected join, sums to 188):

| lifecycle | flagged | share | median var % |
|---|---:|---:|---:|
| no marker | **162** | **86.2%** | 100.9 |
| deactivated | 22 | 11.7% | 192.6 |
| new | 2 | 1.1% | 663.7 |
| obsolete | 2 | 1.1% | 354.8 |

Lifecycle-marked items are **26 of 188 (13.8%)** — a real minority, not the explanation. Note the
marked ones *are* the extreme ones (medians 193–664% vs 101% unmarked), which is exactly why they
dominated a top-20 sorted by magnitude.

The error was **generalizing from a sorted head.** The top-20 was ordered by
`stores_flagged desc, median_pct desc`, so it surfaced the most extreme items — and lifecycle-marked
items cluster precisely there. A sorted head is not a sample. This is CLAUDE.md's "measure it, don't
reason about it" broken one message after invoking it.

**The lifecycle signal is still real and still worth using** — it is machine-readable, sitting
unused in a column the batch job already loads, and it maps onto QSRSoft's own Inventory Analysis
topics 5/6. It is just worth 13.8% of the queue, not the fix.

## ⚠️ The period fan-out bug recurred — third occurrence

The lifecycle query joined `security_findings` to `qsr_variance_stat` on `(loc, wrin)` **without
`period`**. That table's PK is `(loc, period, wrin)`, so every finding fanned out across each period
in the window (~3.5×): the counts summed to **658** against a true flagged count of **188**.

This is the identical defect documented that same morning in
`project-inventory-data-hygiene-2026-08-20.md` under a heading literally titled *"The corrected
query — the original over-counted."* **Written down, then repeated hours later by the same author.**

**Standing rule: any query joining `security_findings` to `qsr_variance_stat` must either join on
`period` too, or pre-aggregate the item lookup:**

```sql
with item as (select loc, wrin, max(descr) as descr from public.qsr_variance_stat group by loc, wrin)
select ... from public.security_findings f join item v on v.loc = f.loc and v.wrin = f.wrin
```

Counts from a `(loc, wrin)`-only join are inflated. Medians and `count(distinct f.loc)` are **not**
affected (a repeated value does not move a median), which is why the bias-cancellation conclusion
above survives unchanged — it rests only on `count(distinct f.loc)`.

## INV-002: 224 flags, none material

224 flagged of 5,207 decided (~4.3%) on **pure 2.5σ with no `min_value` and no `min_denominator`**.
Removing `min_value` was correct — 10 was unreachable — but it left the rule with no materiality
gate at all.

Scale makes those flags meaningless: max rate is **0.09 per $1,000 sales** against a measured
minimum `storeMonthSales` of $2.1M, so the largest flagged variance is on the order of a few hundred
dollars and the median (0.003) a few tens. This is precisely the *"3σ above peers on $4 of variance
is statistically interesting and operationally worthless"* case that dispatch #42 §3 named.

**Root cause is an engine gap, not a configuration one:** `min_value` gates the **rate**, and the
correct floor for INV-002 is an absolute-dollar threshold on the **numerator**. The engine cannot
express that today. Scoped as `min_numerator` in `dispatch-45.md`.

**Recommendation:** INV-002 back to `active = false` until that gate exists. INV-001 **stays
active** — its 188 flags carry real secondary value as a targeted per-store-item hygiene worklist,
sharper than the estate-level 30-WRIN list, even though they are not security findings.

## The question this run leaves open

**What explains 162 flags on ordinary, active, unmarked items at a 100.9% median variance?** Not
estate-wide mis-mapping (cancelled by the baseline), not item lifecycle (refuted above), and not
plausibly shrink at 2× expected usage. That is the live question for the inventory domain, and
nothing should be built on `exp_usage` as a *detection* input until it has an answer.
