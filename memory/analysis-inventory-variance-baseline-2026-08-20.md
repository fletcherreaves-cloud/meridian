---
name: analysis-inventory-variance-baseline-2026-08-20
description: Evaluation of the security build's first real detection output (10,330 findings, 2026-08-20). The measured median TvA variance is 4-7x the plan's own flag guidance, which reframes threshold calibration as a possible measurement-validity question. Also identifies the plan's own strongest-named signal (unexplained variance vs. waste) as buildable today from columns already in qsr_variance_stat but used by neither shipped rule.
sensitivity: open
metadata:
  node_type: memory
  type: analysis
---

# Evaluating the first real detection run (2026-08-20)

Phase 1/1b went live 2026-08-20 and the batch job produced its first real output:
`10330 finding(s) upserted across 6 rule(s), 0 error(s)`. `memory/dispatch-42.md` covers the
*calibration* response to that run. **This file covers what the output actually says about the
business**, which is a different and arguably more important question — and one nobody had asked
yet, since every prior dispatch was building the machine rather than reading it.

## The measured output

```
rule_id  findings  null_value  flagged   min   median     p95        max
INV-001     5165        167      2603   0.00    21.25    176.12   36234.38
INV-002     5165          0         0   0.00     0.00      0.02       0.13
```

INV-001's value is `sum(|variance|) / sum(exp_usage) × 100` per (store, item) over the window —
i.e. **absolute unit variance as a percentage of QSRSoft's own expected-usage figure.**

## The finding: the median is 4–7× the plan's own flag threshold

`plan-security-loss-prevention.md` §2.2 specifies the TvA check as *"variance_pct = (actual −
theoretical) / theoretical × 100. **Flag >3–5%** (tune per item/category)."* That number is the
synthesis of three independent research passes against real industry practice, not a Meridian
invention.

**The measured median across 5,165 live store-item observations is 21.25%.** The median — not the
tail. Taken at face value, that means the *typical* store-item-month in this org would be a
flaggable event by the guidance this build was designed around, and the p95 (176%) describes
observations where actual usage differs from expected by nearly 2×.

That gap is too large to treat as a tuning detail. It has two very different explanations, and
they call for opposite responses:

**(a) The ruler is bent.** `exp_usage` may not be a trustworthy baseline for this org's data — or
counting practice is noisy enough (unit-of-measure confusion, count timing vs. delivery posting,
partial counts) that the "actual" leg carries large non-shrink error. Relevant prior art already
in this repo: `memory/374-recipe-item-verification-2026-08-18.md` documents a real active/recipe
flag problem, `qsrsoft-kb-digest.md`'s Inventory Analysis Report ships **21 named topics** that are
almost entirely counting-integrity issues (items not counted, negative actual usage, duplicate
WRIN suffixes, items not in any recipe), and `eom-variance-raw.js` exists precisely because the
aggregate variance figure lags real counts. If this is the explanation, **threshold tuning is the
wrong response entirely** — you would be calibrating an instrument against its own noise, and
every downstream "finding" would be a measurement artifact wearing an investigator's badge.

**(b) The signal is real.** Genuine, widespread inventory-control loss at a scale the org hasn't
quantified before. If so, the number is not a calibration problem but the single most important
operational finding this build has produced, and the correct response is escalation, not
threshold-raising.

**These are distinguishable with data already in hand — do not guess between them.**

## The confound that must be controlled first

The 21.25% median is **not** yet a clean estimate, and this file should not be cited as if it
were. Two known distortions, both correctable:

1. **Low-volume items inflate percentages structurally.** An item with 4 units of expected usage
   and 1 unit of counting difference reads as 25% variance. With ~190–200 non-condiment items per
   store (per `374-recipe-item-verification-2026-08-18.md`'s per-store counts), the long tail of
   low-volume items likely dominates the median. This is exactly what dispatch #42's
   minimum-exposure floor is for — **and it means the floor is not merely noise-suppression, it is
   a prerequisite for measuring the real variance rate at all.**
2. **`|variance|` is absolute, so over- and under-variance don't net.** A store that is +10% one
   month and −10% the next reads as 10% average absolute variance, not 0%. That's correct for
   *detection* (both directions are anomalies) but wrong for asking *"how much is this org
   actually losing"* — that question needs signed variance and the dollar figure, not this rate.

**The honest reading:** the median for *material* items is not yet known, only the median across
all items including a long low-volume tail. That number is the one worth acting on, and one query
away.

## ✅ ANSWERED, same day — it is (a), decisively

The item-concentration query below was run against live data 2026-08-20. **The result is
"uniform / bent ruler," not close.** The top-30 items by median variance are a catalogue of
hard-to-count and unit-ambiguous items (bag-in-box syrups, FCB mixes, bulk condiments,
sprinkle-quantity freeze-dried toppings) plus packaging in mid-promo transition; the magnitudes
are impossible as shrink (`BREADED CHICKEN BREAST STRIP` at a **798% median** = actual usage ~8×
expected); and many show at **all 27 stores in every period**, which is the opposite of how an
operational problem behaves.

Full evidence, the item table, triage order, and a corrected version of the query below (the
original over-counted via a period fan-out — `store_count` read up to 108, which is 27 stores × 4
periods, not 108 stores):
**`memory/project-inventory-data-hygiene-2026-08-20.md`**.

Consequences already applied: `dispatch-42.md` §2 now records this answer and scopes §4 to the
minimal path (permissive materiality floors, no precise calibration against a known-biased
measurement). The §5 exposure floor matters *more* under this result, since part of the effect is
genuinely low-volume items rather than broken mapping, and the floor is what separates the two.

**The caveat that must travel with this result:** "predominantly measurement error" is not
"entirely measurement error." Real loss can hide inside a noisy signal. This is an argument for
fixing the measurement and for the peer-relative z-score, **not** for concluding there is nothing
to find.

## The diagnostic that separates (a) from (b) — kept for the record

Concentration is the discriminator. A measurement problem is roughly uniform; an operational
problem concentrates.

```sql
-- Does high variance concentrate in specific stores, or is it everywhere?
select loc,
       count(*) as items,
       round(percentile_cont(0.5) within group (order by value)::numeric, 2) as median_variance_pct,
       count(*) filter (where pass) as flagged
from public.security_findings
where rule_id = 'INV-001' and value is not null
group by loc order by median_variance_pct desc;

-- Does it concentrate in specific items, across all stores?
select f.wrin, v.descr, v.cls,
       count(*) as store_count,
       round(percentile_cont(0.5) within group (order by f.value)::numeric, 2) as median_variance_pct
from public.security_findings f
join public.qsr_variance_stat v
  on v.loc = f.loc and v.wrin = f.wrin
where f.rule_id = 'INV-001' and f.value is not null
group by f.wrin, v.descr, v.cls
having count(*) >= 20
order by median_variance_pct desc
limit 30;
```

**Reading the result:** a tight band of per-store medians (say all 27 within a few points) with
the same items topping the list everywhere points hard at **(a)** — a systemic measurement or
recipe-data issue, and the top items in that second query are then a concrete work-list of
count-integrity problems, not suspects. A wide spread across stores, or items that spike at a few
stores and not others, points at **(b)** and is a genuine loss-prevention lead.

## A real gap in both shipped rules — the plan's own strongest signal is unused

Plan §2.2 does not stop at the variance threshold. Its full sentence names the discriminator
explicitly: flag variance *"**especially when not matched by a corresponding waste-log entry** — an
unexplained variance with zero waste logged for that item is the strongest single signal."*

**Neither INV-001 nor INV-002 uses waste at all** — and `qsr_variance_stat` already carries
`raw_waste` and `comp_waste` as first-class columns (`supabase/schema.sql:1367-1368`), populated
by the same daily pull, with a dedicated `qsr_waste` table alongside it. The strongest signal the
research identified is sitting unused in a column the batch job already loads on every run.

This is the highest-value next rule in the inventory domain, and it needs no new data source:
variance that *is* matched by logged waste is largely explained (spoilage, documented dumps);
variance with **zero** logged waste for that item in the same window is the unexplained kind the
plan is actually pointing at. It also directly implements the plan's §1 principle 4 (exoneration —
a rule that automatically searches for its own counter-evidence), which nothing in the build does
yet. Worth scoping as `INV-003` once dispatch #42's z-score and exposure-floor work lands.

## What this does and does not establish

- **Established:** the pipeline works end-to-end against real data; 10,330 findings, zero errors,
  the `qsr_fob` join produces real denominators (`null_value: 0`), and the honest-null contract is
  functioning (167 zero-exposure nulls).
- **Established:** the current INV-001 threshold is uninformative (below its own median) and
  INV-002's cannot fire — both are addressed in dispatch #42.
- **NOT established, and must not be repeated as fact:** that this org has a 21% inventory
  variance problem. That number is uncontrolled for the low-volume confound above. The exposure
  floor plus the concentration queries are what turn it into a real finding — or dissolve it.
- **NOT established:** whether `exp_usage` is a trustworthy baseline in this org's data at all.
  That question is now open and load-bearing for the whole inventory domain, and it did not exist
  as a question before this run produced numbers to look at.

## Cross-reference

The cash half of the build produced **zero** findings this run — `audit_rows` stops at 2026-06-30
against a 28-day window, because the Register Audit pull has been failing since the 403 diagnosed
the same day (`dispatch35-register-audit-implementation.md`). Nothing in this file's inventory
analysis has a cash-domain counterpart yet for that reason.
