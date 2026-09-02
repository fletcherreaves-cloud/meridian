# eBOS menu-item detail endpoints — owner-captured 2026-09-01

## ⭐ Recipe / BOM endpoint — closes a gap the legacy-workbook finding called "no current source at all"

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menuitems/{menu_item_id}
```

Response (real, live, item 2 "Double Hamburger", store 3708):
```json
{
  "item_number": 2, "description": "Double Hamburger", "daypart_code": "Regular",
  "family_group": "Regular Entree", "combination_item": 0, "on_pos": 1,
  "recipe": [
    { "full_wrin": "00005-086", "long_desc": "100% PURE BEEF", "start_date": "2026-05-13",
      "servings": 2, "class": "F", "loose_unit_cost": 0.4272577785446025, "cost_price": 0.854515557089205 },
    { "full_wrin": "00001-705", "long_desc": "BUN/REG BB 3.1", "start_date": "2026-05-13",
      "servings": 1, "class": "F", "loose_unit_cost": 0.16088333333333335, "cost_price": 0.16088333333333335 },
    { "full_wrin": "00284-166", "long_desc": "WRAP/HAMBURGER/SMPD3", "start_date": "2026-05-13",
      "servings": 1, "class": "P", "loose_unit_cost": 0.015955, "cost_price": 0.015955 }
    /* ...7 ingredients total for this item */
  ],
  "hist_recipe": [ /* prior recipe versions, each with start_date/end_date -- e.g. BUN/REG BB
    3.1 at 1 serving from 2024-10-11 to 2026-05-12, at 2 servings from 2024-10-09 to
    2024-10-10, going back to 2023-06-29 -- a REAL recipe-change history, ~7 versions deep */ ],
  "cost_breakdown": { "food": 1.0720873536517048, "paper": 0.015955, "total": 1.0880423536517048 }
}
```

**This is the single biggest gap `memory/finding-legacy-pricing-workbook-structure-2026-08-27.md`
flagged as "no current Meridian source at all"**: that finding's whole "Additional data pulls
needed" section named "Recipe / bill-of-materials data (which ingredients, in what quantity, go
into each menu item)" as gap #2, on par with the Martin Brower cost feed itself — and separately
said the legacy workbook's QCR sheet (recipe → per-item Food & Paper Cost roll-up) "has no
current Meridian analog at all." This endpoint IS that analog, live, per-item, on demand:
- `class: "F"`/`"P"` = food/paper, exactly the legacy QCR's own cost-category split.
- `loose_unit_cost` = the ingredient's own unit cost (the "Serving Factors" sheet's per-serving
  cost, already computed server-side — no separate Martin Brower price list + serving-factor
  join needed on Meridian's end for this to work).
- `cost_price` = that ingredient's dollar contribution to THIS item's cost (`loose_unit_cost ×
  servings`, confirmed: BUN's `loose_unit_cost` 0.1609 × 1 serving = `cost_price` 0.1609 exactly;
  BEEF's 0.4273 × 2 servings = 0.8545 exactly).
- `cost_breakdown.food`/`.paper`/`.total` = Σ`cost_price` by class — and **this matches the
  separately-captured `menu_item_activity_cost` endpoint's numbers EXACTLY** (both report
  `food_cost/food: 1.0720873536517048`, `paper_cost/paper: 0.015955`) — two independently
  captured endpoints agreeing to 13 decimal places is strong cross-validation that both are
  reading the same underlying recipe-cost computation, not two different guesses.
- `hist_recipe` is a genuine recipe-CHANGE history (ingredient, quantity, effective date range)
  — this is exactly what a "why did this item's cost jump on this date" investigation would need,
  and something no current Meridian table has at any grain.

**Not yet done**: confirming this is fetchable in bulk (one call per item like the other three
endpoints below, or a catalog-wide form), building any pull/table/panel around it, or comparing
its `cost_breakdown` against `qsr_product_mix.unit_food_cost`/`unit_paper_cost` for the same
item/store (dispatch #212 already cross-checked `qsr_product_mix` against `qsr_menu_item_
activity`'s cost columns and found them identical — this endpoint is a THIRD independent source,
not yet compared to either of those two). If it's cheaply bulk-fetchable, this alone could
upgrade the Pricing Engine from "menu price vs. an opaque total unit cost" to a full recipe-level
cost breakdown per item — worth prioritizing the recon.

## Other same-day captures (`menu_item_activity_cost` / `_activity2` / `_activity_price` /
`_activity_breakdown`)

Owner-captured live request, in service of the Pricing Engine's item-cost accuracy ("Detail for
Menu Items"):

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity_cost
    ?store_busn_dt=2026-09-01&menu_item_id=4194824
Headers: X-Auth-Token, X-Current-Nsn: {nsn} — same eBOS auth family as the
  purchase-ledger/menu-items pulls already in scripts/qsrsoft-ebos-pull.mjs /
  scripts/qsrsoft-menu-items-pull.mjs (X-Auth-Token + X-Current-Nsn, no new auth path).

Response (real, live):
{
  "food_cost": 1.0720873536517048,
  "paper_cost": 0.015955,
  "total_cost": 1.0880423536517048,
  "last_close_business_date": "2026-08-31"
}
```

## Why this matters

A DIRECT per-(store, item, business_date) cost figure straight from QSRSoft, one item at a time
— not derived/aggregated the way the current Pricing Engine's `computeItemMargins()` does
(`unit_food_cost`/`unit_paper_cost` off `qsr_product_mix`, MAX-per-day / most-recent-day rules).

**The `last_close_business_date` field is the interesting part**: the endpoint itself reports
which business date its cost is anchored to, and that date is described as *"last CLOSE"* —
i.e. this endpoint appears to be inherently scoped to the last fully-closed business day, the
exact same concept `clampToLastClosedDay()` (this session's `qsr_product_mix`-side fix, see
`memory/finding-pricing-engine-stale-price-2026-09-01.md`) had to bolt on manually because
`qsr_product_mix` itself carries no such guarantee. If this endpoint's cost is genuinely
authoritative and closed-day-safe by construction, it could be:

1. A cross-check source to validate `qsr_product_mix.unit_food_cost`/`unit_paper_cost` against
   (a second independent measurement, per this repo's "measure it" standing rule — has NOT been
   cross-checked yet, this is one live capture, not a validated pattern).
2. A candidate replacement source for the Item Lookup feature (`memory/finding-pricing-engine-
   stale-price-2026-09-01.md`'s section 4) if it proves more precise/authoritative than the
   `qsr_product_mix`-derived figures that feature currently uses.
3. `menu_item_id` here (`4194824`) is very likely the same ID space as `qsr_menu_items.
   store_menuitem_id` (`scripts/qsrsoft-menu-items-pull.mjs`'s own captured shape:
   `[{"data": 4194793, "value": "1 - Hamburger"}, ...]` — `data` is that ID) — worth confirming
   directly (not yet done) before building anything that joins the two.

## Second capture, same session: `menu_item_activity2` (per-item activity, on demand)

```
POST https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity2
Body: {"store_menuitem_id":4194824,"start_date":"2026-09-01","start_time":"00:00",
       "end_date":"2026-09-01","end_time":"23:45","item_long_desc":"2 - Double Hamburger"}

Response (real, live):
{
  "currentBusinessTime": "18:53",
  "getMenuItemActivity": [
    { "date_range": "2026-09-01", "activity": 2, "sold": 2, "emp_meal": 0, "mgr_meal": 0,
      "waste": 0, "promo": 0, "free_choice_qty": 0,
      "datetime_range": "Tue - 09/01/2026 | 00:00 to 23:45" }
  ]
}
```

Confirms `store_menuitem_id` (`4194824`) IS the same ID as the cost endpoint's `menu_item_id` —
the item-identity join speculated above is real, not just plausible (both captures used the same
ID for "2 - Double Hamburger"). Also reveals `currentBusinessTime` — a live, on-demand "what time
is it in business-day terms right now" signal, which is directly the same concept
`lastClosedBusinessDay()`/`clampToLastClosedDay()` approximate client-side from wall-clock time.
A LIVE per-item lookup built on these two endpoints could use `currentBusinessTime` /
`last_close_business_date` directly rather than approximating it — worth keeping in mind if a
live (not stored-data) item-detail lookup is ever built, as opposed to the current Item Lookup
tab, which reads already-pulled `qsr_product_mix` data, not a live per-request eBOS call.

This is a per-ITEM, on-demand endpoint (one `store_menuitem_id` per call, POST with a date/time
range) — same "not cheap to bulk-fetch the whole catalog this way" caveat as the cost endpoint
above; still unconfirmed whether either endpoint has a bulk/multi-item form.

## Third capture, same session: `menu_item_activity_price` (per-item, per-CHANNEL price)

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity_price
    ?store_busn_dt=2026-09-01&menu_item_id=4194824

Response (real, live):
{
  "countinChangesInPrice": 1,
  "all_prices": [
    { "price_takeout": 2.39, "price_eatin": 2.39, "price_other": 2.99 }
  ]
}
```

**Potentially significant for the "wrong price" investigation** (section 3 above /
`memory/finding-pricing-engine-stale-price-2026-09-01.md`): this is the authoritative live price
for one item on one business date, broken out by order CHANNEL — takeout/eat-in share one price
here, "other" (likely delivery/kiosk/mobile — unconfirmed which) carries a different, higher
price ($2.99 vs $2.39). `computeItemMargins()`'s current MAX(price)-per-day rule was built on the
assumption that a day's multiple price rows are "menu price vs. a promo tier below it"
(dispatch #212's own live measurement, 49/283 items same-day multi-price). This capture raises a
real, NOT YET INVESTIGATED alternative/additional explanation: some of those same-day multi-price
rows could be genuine CHANNEL pricing (a kiosk/delivery upcharge), not a promo at all — and
`countinChangesInPrice` on this response suggests a channel's price can also change mid-day
independent of promos. This does not contradict the MAX-price rule (the higher price often IS
still the "real" menu price to report), but it means the mechanism behind multi-price days may be
richer than "menu price + promo tier" alone. **Not yet investigated further** — flagging so a
future session doesn't have to re-discover this capture; the right next step would be comparing
`qsr_product_mix`'s raw same-day multi-price rows for a sample item against this endpoint's
channel breakdown to see how they reconcile, before changing any margin-engine logic.

## Fourth capture, same session: `menu_item_activity_breakdown` (per-item, 15-min intraday)

```
POST https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity_breakdown
Body: {"store_menuitem_id":4194824,"date":"2026-09-01","start_time":"00:00","end_time":"23:45"}
```

Returns `getMenuItemActivityBreakdown`: a 2-element array. **Element [0] is a raw MySQL driver
OkPacket object** (`fieldCount/affectedRows/insertId/serverStatus/warningCount/message/
protocol41/changedRows`) — this is a QSRSoft-side implementation leak (their API handler is
serializing a write-query result object into a read response), not anything meaningful to
consume; any future integration must skip it and read element [1] only. **Element [1]** is the
actual payload: one row per 15-minute slice (`activity/sold/promo/mgr_meal/emp_meal/
free_choice_qty/waste`, a `timeslice` duration-since-start counter, and a `times` window label)
— same shape as `qsr_daily_activity`'s hour_slot breakdown but at ITEM grain and 15-min
resolution instead of store grain and hourly. For the one real capture (item 4194824,
2026-09-01), only one 15-min slice was non-zero (13:00-13:15, activity:2/sold:2) — consistent
with the daily total (`activity:2, sold:2`) already seen in the `menu_item_activity2` capture
above, i.e. this is genuinely the SAME underlying data at finer time resolution, not a different
number. The response also returned slices past the requested day (into 09/02) despite the
request body specifying only `date:"2026-09-01"` — unexplained, not investigated further; worth
confirming the exact date-window contract before building anything on this endpoint.

This is a very verbose per-item, per-15-min payload (~100+ rows for one item/one day) — the
least likely of the four captured endpoints to be worth a bulk/scheduled pull; more plausible as
an on-demand "why did this item's numbers look odd that day" drill-down if ever needed.

## Fifth capture, same session: `menuitems` bulk catalog (no ID — confirms an existing pull already covers this)

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menuitems
Response: [{"data": 4194793, "value": "1 - Hamburger"}, {"data": 4194824, "value": "2 - Double Hamburger"}, ...]
```

~5,466 rows for store 3708. **Same endpoint, same response shape, already pulled and stored** —
`scripts/qsrsoft-menu-items-pull.mjs`'s own header documents this exact `GET .../menuitems` call
and upserts `data`→`store_menuitem_id` / parsed `value`→item number + description into Supabase
`qsr_menu_items` (`loc, store_menuitem_id` upsert key). So this capture is not a new source —
it's confirmation that the owner's own live recon and the existing automated pull are reading the
identical endpoint. `qsr_menu_items` currently stores only the flat id/number/description from
this bulk shape; it does **not** carry the recipe/cost/hist_recipe detail from the single-item
`menuitems/{id}` endpoint (capture 1, above) or the cost/price/activity detail from captures 2-4
— those all require a separate per-item call and are not part of this bulk enumeration. Confirms
the earlier "same ID space" cross-check from a second angle: `data:4194824` here again matches
"2 - Double Hamburger", the same item/ID pairing seen in the cost and activity2 captures.

## Open, not yet done

- Not yet confirmed whether this is a per-item, per-DAY snapshot only (would need one call per
  item per day — 5,466 items/store × 27 stores is not a cheap daily full-catalog pull) or
  whether it can be queried for a range/whole catalog in fewer calls. A single-item capture like
  this one doesn't answer that; needs its own recon before scoping a pull script around it.
- Not yet cross-checked against `qsr_product_mix`'s existing `unit_food_cost`/`unit_paper_cost`
  for the same (store, item, date) to see whether the two sources actually agree (dispatch #212
  already did this cross-check between `qsr_product_mix` and `qsr_menu_item_activity`'s cost
  columns and found them identical — this is a THIRD source, not yet compared to either).
- Not yet wired into any pull script, table, or panel. This file exists purely so the capture
  isn't lost (CLAUDE.md's own "commit every memory file" rule) — next step is source recon
  (bulk-fetchability, cross-check against existing costs) before deciding whether to build
  anything on it.
