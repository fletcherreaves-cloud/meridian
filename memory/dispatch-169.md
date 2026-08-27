# Dispatch #169 — Product-mix item correlations in Signal Lab / Scanner (Notes 28 #5)

## The ask (Notes 28 #5, 2026-07-24, verbatim)

> Product-mix correlations (future, needs Product Mix pull — Notes 25 #1)
> Fun fact / test case: **Filet-O-Fish sells more on Fridays and around Easter.** Once product-mix
> data is available, correlate item-level sell-through against day-of-week/calendar/weather.

This is the unblocked slice of the larger "Product Mix → Pricing Engine" backlog item (own
workstream, separately gated on the owner supplying a pricing spreadsheet — NOT this dispatch).

## What already exists — measured before drafting this, not assumed

- **The pull is live**: `.github/workflows/qsrsoft-pmix-pull.yml`, twice daily, per-item per-
  price-point sales facts → `qsr_product_mix`. `loadPmixRows()` (`src/lib/supabase.js`) already
  loads it into `ds.pmixRows`: `{loc, date, item, price, desc, familyGroup, soldQty, discQty,
  promoQty, offerAmt, discAmt, unitFoodCost, unitPaperCost}` — one row per (loc, date, item, price).
- **Calendar day-of-week flags already exist and were built anticipating this exact case**:
  `src/engine/signal-registry.js`'s `calendar` metric category (`calWeekend`/`calFri`/`calMon`,
  v4.533) — the file's own comment names "Friday is broken out on purpose — the Filet-O-Fish-
  Fridays anchor for the eventual product-mix correlation (Notes 28 #5)."
- **A `pricing` metric category already reads `ds.pmixRows`** (`pxDaysSince`/`pxItemsChanged`/
  `pxMeanStepPct`, via `price-events.js`'s confirmed price-step detector) — but this is **price-
  CHANGE events, not item SALES volume**. It answers "did this item's price move," not "how many
  units of this item sold." Nothing in the registry surfaces `soldQty` today.

**So the actual gap is narrow**: `soldQty` (and, if useful, `familyGroup`-level rollups) from
`ds.pmixRows` has never been wired into `METRIC_CATEGORIES`/`METRIC_FLAT`/`extractMetricValues()`
— Signal Lab and the Scanner have no way to correlate ANY item's sell-through against anything,
Filet-O-Fish included. This is a registry-wiring task, not new infrastructure.

## The real design problem — measured, not guessed

Unlike every existing metric category (Weather, Calendar, Pricing — each a small, fixed handful of
metrics), **product mix is per-ITEM**, and there is no fixed small list of items. Live-queried
2026-08-27: a 1000-row sample of `qsr_product_mix` alone contains **391 distinct items**
(`Filet-O-Fish Ml-Lrg`, `Dbl Filet Ml-Lrg`, `Sau Egg McMuff Ml-Hb`, `Mc Chicken Patty`, etc.) — the
real full-dataset item count across 27 stores and months of history is almost certainly several
hundred at minimum. `METRIC_FLAT` today is a small static object (~30 keys total across all six
existing categories) built once from a hardcoded `METRIC_CATEGORIES` array; the Scanner's auto-
correlation sweep runs **every metric pair** in that registry. Naively adding one static entry
per item would both bloat the registry by 10-20x and make the Scanner's pairwise sweep
combinatorially explode (n² pairs) — measure the actual item count before deciding, but do not
assume it's small.

## Task

1. **Measure the real item universe first**: distinct `(item, desc)` count in `ds.pmixRows` across
   the full pull history (not a 1000-row sample), and how concentrated sales are (a top-N by total
   `soldQty` is likely a small fraction of items driving most volume — confirm or refute this
   before designing around it).
2. **Design a DYNAMIC per-item metric resolver, not a static per-item registry entry.** Extend
   `findMetric()`/`extractMetricValues()` in `signal-registry.js` to recognize a metric-key shape
   that names an item (e.g. `pmixItem:<item_code>`) and synthesize its definition (label from
   `desc`, source from `ds.pmixRows`, field `soldQty`) on the fly, rather than hand-listing items
   in `METRIC_CATEGORIES`. This mirrors the `__priceEvents`/`__calendar` "derived, no static source
   table" pattern already established in this file — reuse that shape, don't invent a fourth one.
3. **Signal Lab** (manual, pick-any-two-metrics UI): needs an item PICKER (search/select from the
   real distinct-item list, not a dropdown of 400+ entries) so the owner can build "Filet-O-Fish
   Sold Qty × Friday" as a custom signal on demand. This is the primary interface for the FR's
   actual test case — one item against one calendar/weather metric, not a sweep.
4. **Scanner** (auto-correlate-everything sweep): given the combinatorial risk measured in step 1,
   **do not add all items to the full pairwise sweep by default.** Reasonable options, pick based
   on what step 1 measures (discuss the tradeoff in the PR rather than silently picking one):
   - Cap to the top-N items by total `soldQty` (a volume floor, matching the "concentration"
     hypothesis) and only sweep those against Calendar/Weather (not against every other metric).
   - A separate opt-in "Item Mix Scanner" pass, not folded into the default district-wide sweep.
   - Whatever is cheapest and still finds the Filet-O-Fish-Friday signal in practice — verify
     the actual r-value comes back significant for the real anchor case, not just that the code
     runs.
5. **Confirmed-step/pricing precedent for the "allowZero" and daily-vs-monthly question**: `soldQty`
   is a real per-day count (item didn't sell that day → legitimately 0, not missing) — decide
   `allowZero` deliberately (probably `true`, since "0 Filet-O-Fish sold on a Tuesday" is a real,
   informative data point for the Friday-vs-other-days comparison) and document the reasoning,
   don't default it silently.

## Verification

- The actual acceptance test: build the Filet-O-Fish item's `soldQty` × `calFri` custom signal
  (real data, real 27-store dataset) and confirm it surfaces a positive, significant correlation —
  reproducing the Notes 28 #5 anchor case, not just proving the plumbing compiles.
- Render-based test against the real Signal Lab UI proving the item picker works end-to-end (search
  → select → build a custom signal → see a real r-value), per this repo's "verification must touch
  the call site" rule.
- If the Scanner gets item coverage too, a test proving it does NOT silently degrade into a
  multi-minute sweep or blow past whatever existing pair-count/performance guardrails
  `scanner.js`/the Scanner's own tests already have — check for those before adding new metrics
  that could regress them.
- Standard suite + build bar.

## Out of scope

- The Pricing Engine itself (elasticity/what-if analysis) — separate, gated on the owner supplying
  the old pricing spreadsheet.
- Any change to `price-events.js`'s existing price-change detection — untouched, this is about
  volume, a different signal from price movement.
- `familyGroup`-level rollups are a nice-to-have if cheap given the design in step 2, but the
  FR's actual named case is item-level (Filet-O-Fish specifically) — don't let a family-group
  detour delay the item-level slice.
