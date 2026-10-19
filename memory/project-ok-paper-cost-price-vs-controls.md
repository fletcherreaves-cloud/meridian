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

## 4. Checked separately: is McDonald's "Monopoly" promotional packaging the seasonal factor?

Owner asked to compare regular vs. Monopoly-branded packaging cost, since the annual Monopoly
promotion runs every fall and could plausibly be a *real, recurring* driver of a Sept/Oct
elevation (as opposed to the price-step and controls causes already ruled out above). Measured
directly against `qsr_ebos_line_items`, fleet-wide (all 27 stores, not just OK):

- **The promotion is real and recurs annually, confirmed in the ledger itself**: 2025 run was
  Sept 29 – Oct 10, 2025; the 2026 run started Sept 21, 2026 and is still active as of this
  measurement (Oct 18, 2026) — both inside the Jul–Oct window this whole analysis covers.
- Each Monopoly item is its own distinct WRIN (not a price bump on the regular WRIN) — e.g. the
  regular 30oz clear cup (`15737-073`) and its Monopoly cup (`15737-100`) are separate SKUs.
  Matched 8 regular/Monopoly WRIN pairs and compared same-store monthly-minimum $ (the same
  unit-price proxy used throughout this file; with no unit/quantity field, monthly minimum per
  `(loc, wrin)` is the only base-unit-cost signal available) — paired by store so a store's own
  ordering pattern is the baseline, not pooled across stores with different order sizes:

| Item | Monopoly ÷ regular (median across paired stores) |
|---|---|
| A Bag | 1.00x (flat) — 23 stores |
| B Bag | 1.00x (flat) — 23 stores |
| C Bag | 1.00x (flat) — 27 stores |
| 4oz fry carton | 1.00x (flat) — 23 stores |
| WRAP 4N1 Biscuit | 0.81x (19% *cheaper*) — 26 stores |
| 30oz clear cup | 1.08x — only 1 store had both (too few Monopoly cup orders yet to trust) |
| **Hash brown bag** | **2.52x (+152%)** — 27/27 stores, tight clustering |
| **6oz fry carton** | **2.33x (+133%)** — 26/27 stores, tight clustering |

Most Monopoly items cost the same as their regular counterpart — only printing changed. Two
items (hash brown bag, 6oz fry carton) show a real, fleet-wide, tightly-clustered markup — that
consistency across 26-27 independently-ordering stores is itself evidence this is a real vendor
cost difference for those two items, not noise (case-pack-size differences between the regular
and Monopoly version of an item remain a possible confound given there's no quantity field to
rule it out directly, but it would have to apply identically at ~2.3-2.5x to independently affect
26+ stores to produce this pattern).

- **Dollar impact of the two marked-up items, Sept 21–Oct 18, 2026, fleet-wide: ~$14,900
  "excess"** (mono_total_$ fleet-wide was $10,502 for hash brown bag and $15,076 for 6oz fry
  carton; at their measured markup ratios, roughly $6,330 + $8,610 of that is above what the
  regular-item rate would have cost).
- **But there's also a corporate/vendor credit tied to the same promotion**, posted as its own
  ledger line (`wrin='00000-000'`, description `"Monopoly Promotion"`), landing in the `paper_sub`
  category: **−$51,561 fleet-wide** over the same window, varying per store/transaction (one
  common value, −$416.92, repeats 25 times; the rest are store/invoice-specific, consistent with
  a real volume-tied rebate rather than a flat fabricated number).
- **Net: the promotional credit (−$51,561) is larger than the two items' markup overhead
  (~+$14,900)** — Monopoly is a net REDUCTION to measured paper cost this period, not an
  inflator. This is already baked into the "paper $ volume is down district-wide" finding in
  section 2 above, not a separate adjustment needed.

**Conclusion: Monopoly packaging is real and does recur every year, but it is not the Sept/Oct
seasonal factor, and if anything nets slightly favorable.** It does NOT change the bottom line
above — the apparent spike is still explained almost entirely by the seasonal-baseline framing
in section 3, not by price, controls, or Monopoly packaging.

### Isolated vs. net — both are true, they answer different questions

Owner asked (2026-10-19): if the corporate rebate is set aside, did the two marked-up Monopoly
items genuinely raise the Paper Cost % PnL line? **Yes — the markup is real dollars on real
purchase-ledger lines, independent of the rebate.** Quantified, fleet-wide, Sept 21–Oct 18,
2026:

- The $14,940 excess (hash brown bag + 6oz fry carton, vs. what the regular-item rate would
  have cost) is **≈0.18 percentage points of Paper Cost %** for that window, measured against
  fleet sales of $8,204,173 and fleet paper purchase-$ of $372,527 (4.541% on a purchase-$
  basis). Strip only that excess out and the window's paper cost % would read ~4.36% instead of
  4.54%.
- This is a *different question* from "what was the net effect of the whole Monopoly
  promotion." **Both are correct, simultaneously**: in isolation, the two marked-up items did
  push the cost line up by ~0.18pp; net of the −$51,561 promotional rebate (which the ledger
  books separately, also under `paper_sub`), the *combined* Monopoly effect this period was a
  reduction, because the rebate (>3x the markup) swamps it. The rebate doesn't make the markup
  not real — it's a separate credit that happens to more than offset it on the P&L.

### Reference document: owner-supplied official 2026 execution manual

`data/monopoly-promo/2026_McD_Monopoly_ExecutionManual_OTC.pdf` (McDonald's USA, LLC's own
restaurant execution manual for this program) independently corroborates the above:

- Its "Themed Only Packaging Element" table (p.13) lists A Bag 100% Recyclable = WRIN
  `10958-962`, B Bag = `13229-666`, C Bag = `15849-199` — **all three match the live ledger
  WRINs exactly**, confirming the dataset and the per-store paired-ratio comparison methodology.
- **Hash Browns and (Large) Fries are official national program items** (p.7's "Packaging
  Products" trigger-item list), not a local/vendor anomaly — the manual's packaging-WRIN tables
  (p.6, p.13-14) just aren't exhaustive for every trigger product, so the hash-brown-bag and
  6oz-fry-carton WRINs found live but not itemized there are still legitimate program packaging.
- **The official promotion runs through 11/1/26** (Game Piece Card distribution 10/6–11/1), two
  weeks past this analysis's 10/18 measurement cutoff — so the $14,940 excess / −$51,561 rebate
  figures above are a partial-window snapshot. Re-measure after 11/1/26 for the full-promotion
  total before treating either number as final.
