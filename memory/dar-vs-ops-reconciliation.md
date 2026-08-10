---
name: dar-vs-ops-reconciliation
description: Why DAR-derived daily totals differ slightly from the manual Operations Report, what was ruled out, and why auto-first is still correct. Read before "fixing" the ~$1/day discrepancy or before retiring the manual tables.
metadata:
  type: project
---

# DAR vs the manual Operations Report (2026-08-07)

## The question

Before standardising on auto-pulled data, the owner set the bar: **DAR-derived daily
totals must match the compiled daily reports EXACTLY, not close.** This is what the
measurement found.

## The measurement

Comparing `qsr_daily_activity_rollup.product_sales` against `labor_rows.sales` for the
same (loc, date):

| month | store-days | exact | within 0.5% | DAR higher |
|---|---|---|---|---|
| 2025-06 | 728 | 77% | 160 | 144 |
| 2025-12 | 705 | 81% | 130 | 132 |
| 2026-03 | 744 | 87% | 94 | 93 |
| 2026-06 | 810 | 86% | 110 | 112 of 113 |

On days with a **complete 24 slots**, the real deltas are **$0.68 – $2.04** on a
$10–20k day — roughly **0.01%**, and almost always DAR-higher.

⚠️ An earlier pass reported deltas of $5,373 and $2,199. Those were a **query truncating
at 20,000 rows**, not real. Always paginate before comparing.

## What was ruled out, and how

**Wrong column?** No. `product_sales` is right — 40/46 exact against manual `sales`.
`net_sales` gives 0/46 exact.

**Day-boundary / ABC cutover?** No. `hour_slot` runs **`05:00 → 28:00`** — 24 slots
covering 04:00→04:00. DAR *is* business-day aligned, matching McDonald's ABC (automatic
cutover at 4:00am local). Agreement improving over time (77% → 81% → 87%) is consistent
with ABC standardising the cutover across restaurants.

**Late-arriving data / waystation lag?** No — and this was the surprise. The QSRSoft KB
("Questions about the DAR") points at waystation issues, which suggested eventual
consistency. **Tested by re-pulling 2026-06-20: all 27 stores returned byte-identical
values.** DAR is deterministic and reproducible.

## Conclusion

The difference is **definitional** — the two measures include marginally different
things — not drift, not timing, not a bug in our aggregation. DAR being *stable* is the
property that matters for an analytics system, and it is.

**Open question worth one low-priority support ticket to QSRSoft:** what does hourly
`product_sales` include that the Ops Report daily total does not?

## Decisions taken

1. **Auto-first chains (v4.855).** All 30 metrics now lead with auto/emailed sources.
   Previously 27 of 30 led with manual, contradicting CLAUDE.md's own standing rule.
   Justified on the merits too: DAR is hourly (even quarter-hourly), the Ops Report is a
   day total — the day is derivable from the hours, never the reverse.
2. **Manual is KEPT, last in every chain.** It holds history back to **2022-01-01**;
   DAR only starts 2025-01-01. `metricDaily` resolves per-day, so pre-2025 dates fall
   through to manual automatically. It is also the escape hatch when an API changes.
3. **No mass backfill.** DAR coverage 2025-01-01 → present was found to be complete
   except a **single missing date (2025-05-27)**, since backfilled. Extending to 2022
   would roughly triple the table (~657k rows) to serve history that is already covered
   by the manual tables.
4. **Manual as a reconciliation oracle**, not just a fallback — wire a continuous
   cross-check so future divergence surfaces automatically instead of via a manual
   investigation like this one. NOT YET BUILT.

## Facts worth keeping

- QSRSoft **does** serve deep history via the API — a 2023-06-01→03 probe returned
  600 rows/day for 25 stores (43380 and 43701 opened later, which is why 25 not 27).
  `start_date`/`end_date` inputs on `qsrsoft-dar-pull.yml` already support backfill.
- That probe left **3 stray days (2023-06-01..03)** in the table — an isolated island
  that makes "oldest DAR date" read as 2023-06-01. Leave, delete, or extend properly.
