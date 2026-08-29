# Dispatch #212 — Pricing Engine, first slice: per-item margin (cost vs. price)

## Context — the data already exists, this has been queued since Notes 25 #1

`memory/notes-25-queue.md` has flagged this as the "🔷 BIG own workstream" Pricing Engine item for
weeks, triaged as blocked on "owner's spreadsheet + source recon." A fresh scoping pass
(2026-08-29) found that block is gone: **a real, non-placeholder item-level margin view is
buildable TODAY, from data that has been flowing for 8 months already, with zero new pulls.**

**The surprise finding, live-verified**: `qsr_product_mix` (not this week's new #184/#186/#193
cost-pull chain) already carries both a real per-item **selling price** and real per-item
**`unit_food_cost`/`unit_paper_cost`**, for the full catalog, all 27 stores, since **2026-01-01**
(`unit_food_cost` has ZERO nulls across 2,537,009 rows). Cross-checked 20 real items at store 3708
against dispatch #193's brand-new `qsr_menu_item_activity.food_cost` — **exact match to 4 decimals
on every item**. Dispatch #193's cost fields are the SAME QSRSoft-computed number already in
`qsr_product_mix`; its real incremental value is the waste/emp-meal/mgr-meal/promo breakdown, not
new cost data. **Do not build this dispatch around `qsr_menu_item_activity`** — it's still only
2 days deep and 6/27 stores as of this scoping pass, far behind `qsr_product_mix`'s coverage.

## The math — read `src/engine/price-events.js`'s header in full before writing any of this

`src/engine/price-events.js` already proved and documented the ONE non-negotiable rule this
dispatch depends on: **real menu price per (loc, item, date) = `MAX(price)` that day**, never an
average — `qsr_product_mix` carries multiple price rows on a promo day, and promos always sit
below menu price (live-confirmed there: 49/283 items at one store on one sample day had >1 price
row). This exact convention is proven, cited, and already load-bearing elsewhere in this repo —
**do not re-derive or second-guess it, and do not use `AVG(price)` or `SUM($)/SUM(units)`
anywhere in this dispatch.** Note: no existing function in `price-events.js` exports this exact
"resolve the real price per item per day" step as a standalone reusable call (the MAX-per-day
grouping lives inside `detectPriceSteps()`'s internals, built for step-change detection, not
margin math) — you will write a small new grouping step for this dispatch, but the RULE itself
(`MAX`, not `AVG`) is not up for reinterpretation.

```
per (loc, item, date), then aggregated over the selected window:
  menuPrice      = MAX(price) that day (never AVG)
  foodCost       = unit_food_cost   (constant per item/day across price tiers — no join ambiguity,
                                      live-confirmed: item 4's cost was identical at both its
                                      $2.79 and $3.59 price rows the same day)
  paperCost      = unit_paper_cost
  marginDollars  = menuPrice - foodCost - paperCost
  marginPct      = marginDollars / menuPrice
  volume         = SUM(sold_qty) over the window (see the wrap-combo trap below)
  totalContrib   = marginDollars × volume   -- a SEPARATE ranking from marginPct, see below
```

## Real data-quality traps — all live-confirmed this session, build the guards in from day one

1. **Promo contamination** — covered above. `MAX(price)`, never `AVG`.
2. **Wrap-combo unit halving** — `supabase/schema-product-mix.sql`'s own documented gotcha: items
   like Snack Wraps (25254/25261/25729-family, "2 …"/"3 …"-prefixed multi-item bundles) have
   `sold_qty` measured at HALF the true unit count per a vendor banner quirk. Read that schema
   file's own comment for the exact affected-item list/logic before writing the volume rollup — a
   $-contribution ranking that doesn't correct for this understates those items' true margin
   dollars by ~50%.
3. **Combo vs. component double-counting** — a combo SKU (e.g. item 8936 "Big Mac Meal") already
   carries its OWN price/cost row, independent of the à la carte item it's built from (item 5 "Big
   Mac", live-confirmed: `price:6.80, unitFoodCost:1.7057` for the combo vs. the sandwich's own
   separate row). **Group strictly by `item_number`, never by `description`** (same standing
   warning `schema-product-mix.sql` already carries) — summing combo AND component into one
   store-wide total double-counts the food cost.
4. **Low-volume noise** — same-day/short-window `sold_qty` can be 1 or 2 for real items. `marginPct`
   itself stays accurate regardless (price/cost are recipe/menu attributes, not derived from that
   day's mix) — but a $-contribution ranking is noisy at low volume. Show marginPct and $-impact
   as two SEPARATE rankings (a high-%-low-volume item and a thin-%-high-volume item tell different
   stories — don't collapse them into one blended score) and default the window to something with
   real volume (7-30 days), not a single day.

## Task 1 — Engine (new, `src/engine/pricing-engine.js`)

`computeItemMargins(pmixRows, { locFilter, dateRange } = {})` — implements the math above,
returns one row per `(loc, item_number)` (or aggregated across the selected store scope,
your call on the exact grouping API, but never blur `item_number` identity per trap #3):
`{loc, itemNumber, descr, menuPrice, foodCost, paperCost, marginDollars, marginPct, volume,
totalContrib}`. Pure function, real unit tests with synthetic `qsr_product_mix`-shaped fixtures
covering: a promo-tier same-day case (assert `MAX` wins, not `AVG`), a wrap-combo item (assert the
correction applies), a combo-vs-component pair (assert no double-count), and a low-volume item
(assert `marginPct` is still correct even at `volume:1`).

## Task 2 — Panel (new, `src/views/pricing-engine.js`, `PricingEnginePanel`)

Register in `panel-registry.js`: `{ id:'pricing-engine', label:'Pricing Engine', icon:'💲',
perm:'analytics.store', kind:'test-kitchen', section:'inventory-food-cost', tkOrder:<next> }` —
`kind:'test-kitchen'` for now (this repo's standing promotion convention: real `section` from day
one, flip `kind` later to ship it for real — see CLAUDE.md's panel-registry rule), but give it its
real eventual section immediately, matching Product Mix's own `section:'inventory-food-cost'`.

Build on `ProductMixPanel`'s existing plumbing (`src/views/labor-tools.js` — its lazy-fill
(`ensureLazyFillWide`), store selector, and 7D/30D/90D/180D/All date-range tiers are already
working; reuse that pattern/those calls, don't rebuild a second `ds.pmixRows` fetch path) rather
than a from-scratch data-loading layer. Content:
- A scope selector (`LocationSelector`, per this repo's panel-contract standing rule) + the same
  date-range tiers `ProductMixPanel` already has.
- A hero/summary: blended margin % for the selected scope (say the number AND the read — e.g. "district
  blended margin 62% — 3 items below 40%, chase those first" — matching CLAUDE.md's standing "say
  the number and the decision" UI voice rule, not just a bare percentage).
- Two SEPARATE ranked tables (per trap #4): lowest `marginPct` items (margin-rate concern —
  someone's pricing this wrong or costs moved), and biggest `totalContrib` losers/winners
  (volume-weighted $ impact — what actually moves the P&L). Don't merge these into one sort.
- Each row: item name, loc (or "all stores" if scoped wide), price, food+paper cost, margin $ and
  %, volume. Click-through or expand for the per-store breakdown if scoped district-wide.

## Verification

- Unit tests per Task 1 covering every trap above, with synthetic fixtures — not just a happy path.
- A REAL live measurement (name credential/method): pick 3-5 real items at a real store, hand-
  compute their margin from the raw `qsr_product_mix` rows yourself, and confirm the panel shows
  the same numbers — matching this repo's "measure it, don't reason about it" standing rule for
  anything touching money.
- Confirm the wrap-combo correction and the combo/component grouping produce sane, non-doubled
  totals against a real store's real item list (spot-check by hand, not just unit-test the logic
  in isolation).
- Panel-contract check: close affordance via the host page's own chrome (no hand-rolled backdrop —
  build directly with `RoutePanelShell`/existing panel conventions from the start, don't build a
  hand-rolled one now only to convert it later), `LocationSelector`, mobile-scroll on the ranked
  tables (`overflowX:'auto'`).
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope (explicitly, for this first slice)

- **Elasticity/what-if price simulation** — the legacy workbook's actual "Pricing Engine"
  (BRK/REG PRICING IMPACT sheets, modeling a price delta against trailing volume). Nothing in
  current Meridian data or engines does demand modeling; this dispatch is a static cost-vs-price
  snapshot/ranking, not a simulator. Real future work, not this dispatch.
- **`qsr_menu_item_activity`'s waste/emp-meal/mgr-meal/promo enrichment** — real and complementary,
  but that table is still early (2 days/6 stores as of this scoping pass) and its cost fields are
  redundant with what this dispatch already uses. A later enrichment dispatch once that pull's
  coverage catches up, not a blocker here.
- **`qsr_raw_item_info`'s recipe/BOM drill-down** — only covers each store's top-50-variance-WRIN
  slice, not the full catalog; could be a nice "why is this item's cost X" drill-in for whichever
  items happen to be in that slice in a future dispatch, not required for this one.
- **Multi-month margin TREND charting** — the legacy workbook's item-code-stability gap (#5, does
  `item_number` stay constant across a menu relaunch) was not verified in the scoping pass. A
  current-window ranking/snapshot (what this dispatch builds) doesn't need that guarantee; a trend
  view would, and should get its own quick live check first before anyone builds one.
- Any change to `qsr_product_mix`'s pull, schema, or the proven `MAX(price)` convention itself —
  reuse as-is.
