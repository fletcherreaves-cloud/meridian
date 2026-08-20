---
name: project-inventory-data-hygiene-2026-08-20
description: 30 WRINs whose expected-usage (exp_usage) mapping is systematically wrong across the whole estate, surfaced accidentally by the security build's first detection run. Not a loss-prevention finding — a data-quality work list whose fix improves FOB accuracy, inventory variance reporting, and count-cycle completion at the same time. Includes the corrected query (the original over-counted via a period fan-out).
metadata:
  node_type: memory
  type: project
---

# Inventory data hygiene — 30 WRINs with broken expected-usage mapping

**Found 2026-08-20, as a by-product.** The security build's first live detection run
(`analysis-inventory-variance-baseline-2026-08-20.md`) produced a 21.25% median TvA variance —
4–7× the plan's own flag guidance. Drilling into *which items* drove it was meant to answer a
loss-prevention question (systematic vs. operational). It answered that decisively — **systematic**
— and in doing so surfaced something more immediately valuable: a concrete list of items whose
`exp_usage` figure cannot be trusted, at every store.

**This is not a suspect list.** Nothing here implies loss. It is a data-quality work list, and
its value is not confined to the security build — `exp_usage`/variance feeds FOB reporting,
the EOM inventory workflow, count-cycle completion, and the Inventory Analysis panel. Everything
downstream of a wrong expected-usage number inherits the error.

## The measured list (median TvA variance %, INV-001, window 2026-06..2026-08)

| WRIN | Description | Class | median var % |
|---|---|---|---:|
| 10537-004 | BREADED CHICKEN BREAST STRIP | food | 798.67 |
| 04498-076 | PIE CTN/BKD/APL/McCAFE | paper | 385.34 |
| 00511-054 | MINUTE MAID FRUIT PUNCH BIB | food | 278.93 |
| 05869-005 | WRAP/BLUE DLYDBL | paper | 228.16 |
| 03268-000 | COFFEE/DECAF/PREM BLEND/2.25Z | food | 214.39 |
| 01835-026 | WRAP/4N1 CHICKEN AT BRKFST | paper | 211.36 |
| 00026-041 | MUSTARD/BULK | food | 151.10 |
| 03876-048 | Fanta Strawberry FCB 2.5G | food | 149.32 |
| 18896-000 | FD DRAGONFRUIT PIECES | food | 145.60 |
| 18895-000 | FREEZE DRIED STRAWBERRY PIECES | food | 141.24 |
| 10195-005 | LID/8/12 OZ/DOME/SUNDAE/RR | paper | 117.92 |
| 02407-015 | LID/OATMEAL BOWL/12 OZ/RRPP | paper | 110.36 |
| 19179-026 | BIG MAC CRTN/2026 SUMMER BRAND | paper | 104.23 |
| 00021-086 | FANTA ORANGE/BIB | food | 99.05 |
| 06043-009 | CRINKLE PICKLE | food | 87.06 |
| 19647-000 | 3PC McCrispy Strips Carton | paper | 85.19 |
| 02400-012 | TEA/ICED/FILTER PACK/3 OZ | food | 81.77 |
| 05582-319 | 10PC NGT/2026 SUMMER BRAND REL | paper | 79.06 |
| 04334-006 | FCB/BLUE RASPBERRY | food | 77.72 |
| 07559-107 | CHOC DRIZZZLE 12oz BTL | food | 74.54 |
| 00261-266 | SUNDAE CUP/9 OZ/RR | paper | 74.45 |
| 15831-007 | SMALL NG CLR CP MCRF | paper | 72.65 |
| 00060-134 | MCD VAN SHK SYR 1GAL PCH 4CTCS | food | 70.52 |
| 18985-008 | Cold Foam | food | 68.62 |
| 15635-004 | FOIL POUCH SPICY McCRISPY CKN | paper | 64.17 |
| 07312-064 | BAG/BKD GOODS/MCCAFE REFRESH 2 | paper | 63.08 |
| 00255-012 | DRIZZLE/CARAMEL | food | 61.65 |
| 10726-000 | SWEETENER FOR BREWED TEA | food | 59.35 |
| 08551-000 | HI C ORANGE LAVABURST 5 GAL | food | 58.80 |
| 07533-009 | POWERADE/MNTN BLAST/5.0 BIB | food | 56.90 |

## Why these are measurement error, not loss — three independent reasons

1. **The list is a catalogue of hard-to-count or unit-ambiguous items.** Bag-in-box syrups
   (Fruit Punch, Fanta Orange, Powerade, Hi-C), FCB mixes, bulk condiments (mustard, pickles,
   caramel and chocolate drizzle, tea sweetener, cold foam, shake syrup), and sprinkle-quantity
   freeze-dried toppings (dragonfruit, strawberry). Partial-jug and partial-box counting is
   imprecise by nature, and small absolute error on a small base is a huge percentage.
2. **Packaging in mid-promo transition is heavily represented.** `BIG MAC CRTN/2026 SUMMER BRAND`,
   `10PC NGT/2026 SUMMER BRAND REL`, `3PC McCrispy Strips Carton`, and the wraps. A seasonal or
   promotional packaging swap is exactly when a recipe still points at the outgoing WRIN while
   stores consume the incoming one. QSRSoft's own Inventory Analysis Report has dedicated topics
   for this class of problem (`qsrsoft-kb-digest.md`): **Topic 3** (items not in any recipe but
   with inventory), **Topic 5** (inventory on multiple WRIN suffixes — its own note says *"all
   duplicate WRINs change recipes after the new WRIN is delivered at the next POS Open"*),
   **Topic 6** (items not active but part of an active recipe), **Topic 7** (menu items with
   incomplete recipes).
3. **The magnitudes are impossible as shrink, and they are medians across the whole estate.**
   798% means actual usage ran ~8× expected — a unit-of-measure or recipe-coefficient error (cases
   vs. eaches, or a coefficient off by an order of magnitude), not theft. And many of these show
   at **all 27 stores in every period**. Loss concentrates; this is uniform.

## What to actually do

**The fix is mostly in QSRSoft configuration, not Meridian code** — recipe/WRIN setup, unit-of-
measure definitions, and retiring superseded promo WRINs. QSRSoft ships the diagnostic for it
already (the Inventory Analysis Report's 21 topics, with per-topic recommended actions). This
list is best used as a **prioritized starting point** for that report rather than as a task
Meridian implements.

Suggested triage order, highest confidence of a real config error first:
1. **`BREADED CHICKEN BREAST STRIP` (798%)** — a newer product, present at only 39 store-periods
   rather than the full estate, which is the signature of a rollout whose recipe was never set up
   correctly. Highest single-item impact and likely the easiest to confirm.
2. **The promo packaging group** (`BIG MAC CRTN/2026 SUMMER BRAND`, `10PC NGT/2026 SUMMER BRAND
   REL`, McCrispy carton/pouch, the wraps) — check for duplicate/superseded WRIN suffixes per
   Topic 5, since these should resolve as a batch once the transition is cleaned up.
3. **The bulk-liquid group** (BIB syrups, FCB, shake syrup, drizzles) — verify the count
   unit-of-measure matches what the recipe expects. Partial-container counting practice may also
   need a standard, which is an operations answer, not a config one.
4. **The sprinkle/topping group** (freeze-dried pieces, sweetener, cold foam) — likely genuinely
   low-volume rather than mis-mapped. **Do not spend time here until the exposure floor from
   dispatch #42 §5 lands**, which will separate "mapping is broken" from "this item is just tiny."

## The corrected query — the original over-counted

The query that produced the table above joined `security_findings` to `qsr_variance_stat` on
`(loc, wrin)` **without `period`**. `qsr_variance_stat`'s PK is `(loc, period, wrin)`, so every
finding fanned out across each period in the window — the `store_count` column read up to **108**,
which is 27 stores × 4 periods, **not 108 stores**. The medians are unaffected (the same value
repeated does not move a median), but any count from that query is inflated roughly 4×. Use this
instead:

```sql
select f.wrin,
       max(v.descr) as descr,
       max(v.cls)   as cls,
       count(distinct f.loc) as store_count,
       round(percentile_cont(0.5) within group (order by f.value)::numeric, 2) as median_variance_pct
from public.security_findings f
join public.qsr_variance_stat v
  on v.loc = f.loc and v.wrin = f.wrin
where f.rule_id = 'INV-001' and f.value is not null
group by f.wrin
having count(distinct f.loc) >= 10
order by median_variance_pct desc
limit 30;
```

## Immediate related action on the security build

`INV-001` is currently `active = true` and generated **2,603 flagged findings** in its first run,
which this file establishes are predominantly measurement artifacts. Anyone who opens that queue
before dispatch #42 lands will be working noise and will lose confidence in the system on first
contact — a real cost, and hard to reverse. Recommended stopgap until #42 ships:

```sql
update public.security_rules set active = false, updated_at = now()
  where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id in ('INV-001', 'INV-002');
```

(Deactivating is preferable to raising the threshold: it's honest about the rule not being ready,
and it leaves the already-written findings in place for the #42 work to re-measure against. The
batch job will simply skip both rules until they're re-activated.)

## What this does not establish

"Predominantly measurement error" is not "entirely measurement error." **Real loss can hide inside
a noisy signal**, and nothing here rules that out — it argues for fixing the measurement and for
dispatch #42's peer-relative z-score (which subtracts a common systematic offset and can still
surface the store that deviates from its peers on a badly-mapped item), **not** for concluding
there is nothing to find. Do not cite this file as evidence that inventory loss is absent.
