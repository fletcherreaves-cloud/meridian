# OK Paper Cost % — price vs. controls investigation (measured 2026-10-18)

Owner asked to decompose Oklahoma's elevated Paper Cost % into "real vendor price increase"
vs. "controls/over-ordering," using the backfilled `qsr_ebos_line_items` purchase ledger
(14mo continuous coverage as of this date: 2025-08-18 → 2026-10-18, all 27 stores, 359,456
rows — see the eBOS backfill work earlier this session). Owner then narrowed scope: **"you can
probably focus on July to current"** — all numbers below use that window.

**Method note (per CLAUDE.md "measure it, don't reason about it"):** the purchase ledger has no
quantity/unit-price field. Per-SKU unit price is proxied by the **monthly minimum** of a line's
category-sub dollar amount for a given `(loc, wrin)` — the smallest recurring order on a SKU is
the closest available proxy to "price per base unit" without a real unit-price field. A "real
price increase" below means the proxy rose ≥10% between the two windows, not a single outlier
invoice.

## 1. How much of the Jul–Oct $ is a real, sustained price increase?

Windows: baseline = Jan–Jun 2026 monthly-minimum average per SKU; recent = Jul–Oct 2026.
Scope: pure-paper line items (`paper_sub>0`, every other category sub = 0) for the 20 OK stores,
53,336 lines, 1,088 `(loc, wrin)` pairs with enough coverage in both windows to judge.

| | count | Jul–Oct $ (matched SKUs) |
|---|---|---|
| Price up ≥10% | 55 pairs | $98,101 |
| Flat (±10%) | 968 pairs | — |
| Price down ≥10% | 65 pairs | — |
| **Total matched** | 1,088 | **$764,434** |

**Real sustained price increases explain 12.8% of the Jul–Oct paper spend among matched SKUs.**
Biggest dollar-impact increases: `15737-073` 30oz clear cup (+33.5%, several stores), `15833-032`
McCafé NGC cup (+12–50% across stores), `00193-522` brown recycled napkin (+12–22%),
`13229-425` Simply McDonald's bag (+34–50%). Full ranked list:
`price_step_results_juloct.json` (session scratch, not committed — re-derivable from the method
above against the live `qsr_ebos_line_items` table).

## 2. Is the rest explained by over-ordering / controls (rising $ volume)?

**No — total paper $ volume is actually DOWN district-wide, not up.** Store-level total paper $
(all paper lines, not just matched SKUs), Jan–Jun avg/month vs Jul–Oct avg/month:

- District total: **$257,142/mo → $242,606/mo (−5.7%)**
- 17 of 20 stores individually down; only 3 essentially flat/slightly up (+0.4% to +7.1%)
- Order-line count (a proxy for order frequency) also down district-wide, consistent with fewer/
  smaller orders, not more
- Isolating the flat/down-priced SKUs specifically (87% of the $, where price can't explain any
  change): their own $ volume is flat (+2.3%) while their own order-line count is actually down
  (−4.4%) — the opposite signature of over-ordering

**Over-ordering/waste, measured in absolute dollars, is not the driver.** The district is
spending modestly *less* on paper than it was in the first half of the year, not more.

## 3. So why does Paper Cost % still read elevated? — sales-denominator effect, mostly seasonal

Paper Cost % = paper $ ÷ sales $. If sales fall faster than paper $, % rises even while $ itself
falls. Measured directly (`qsr_daily_activity_rollup.product_sales`, same 20 OK stores):

- District sales: **$6,616,842/mo (Jan–Jun) → $5,995,579/mo (Jul–Oct), −9.4%** — all 20/20 stores
  declined
- Paper $ fell less (−5.7%) than sales fell (−9.4%) → **district paper% rose Jan–Jun→Jul–Oct from
  3.89% to 4.05% (+0.16pp)**, and 17/20 stores show the same direction
- **This Jan–Jun→Jul–Oct sales drop is mostly ordinary within-year seasonality, not a real
  decline** — checked against last year: Jul–Oct 2026 sales are only **−2.0% vs. Jul–Oct 2025**
  (LY), nowhere near the −9.4% sequential drop from this year's own stronger Jan–Jun period.
- **The cleanest check — true YoY, same season, Aug–Oct 2025 vs Aug–Oct 2026 (avoids comparing
  across different seasons entirely):**
  - Paper $: $728,876 → $703,284 (**−3.5% YoY**)
  - Sales: $17,504,678 → $17,123,934 (**−2.2% YoY**)
  - **Paper Cost %: 4.16% → 4.11%, i.e. −0.06pp — flat to slightly BETTER year-over-year, not
    elevated at all.**

## Bottom line

The "October spike" read against an internal Jan–Jun 2026 baseline is largely a **seasonal-
baseline artifact**: Jan–Jun is the district's seasonally strongest sales period, so any later
period's paper% will look elevated against it even with nothing wrong. Measured on an
apples-to-apples basis (same season, year over year), Oklahoma's paper cost % is flat-to-
improved, not spiking. Of the three candidate explanations:
- **Real vendor price increases**: real, but small (12.8% of Jul–Oct paper $ on matched SKUs)
- **Controls / over-ordering (absolute $ growth)**: not supported — paper $ volume and order
  frequency are both down district-wide
- **Comparison-baseline artifact**: the dominant factor — the elevation mostly disappears under a
  true YoY same-season comparison

**Do not re-raise "OK paper cost is spiking" without first re-running the YoY same-season check
above** — a within-2026 sequential comparison to Jan–Jun will reliably look elevated for calendar
reasons alone, independent of anything operational.

Scratch analysis scripts/data (reproducible, not committed): session scratchpad
`price-vs-controls/` — `pull.py`, `analyze_price_juloct.py`, `analyze_volume.py`,
`pull_sales.py`, `pull_sales_ly.py`, `analyze_pct.py`.
