# Pricing Engine: URL page + MI# display + in-progress-day price bug (2026-09-01)

Owner, on the Pricing Engine (dispatch #212/#220's "first slice"):
- *"We should make it a URL page for starters, and then begin adding sections/panels/reporting
  to it as we unlock new ways to use this data."*
- *"I am not sure the Price you are populating is the correct price on a lot of items, making
  the margins seem way off."*
- *"One way to help clarify it so i can help is to list the corresponding Menu Item # alongside
  the product name. Actually list it first. There are multiple MI #'s for virtually everything,
  some have several. They allow for running promotional pricing and can sometimes be slight
  variations of same product."*

## 1. Promoted to a URL page

`panel-registry.js`'s `pricing-engine` entry: `kind:'test-kitchen'` → `kind:'nav'`, added
`route:true` — the standard one-field promotion flip (CLAUDE.md's own rule; `section` was
already correct, `inventory-food-cost`, from day one). `src/views/pricing-engine.js`: swapped
its hand-rolled `ModalShell` mount for `RoutePanelShell` (same "shell inside the component"
pattern every other promoted panel uses). Wired in `App.js`: `showPricingEngine` state retired,
`modal==='pricing-engine'` now calls `goRoute('pricing-engine')`, new
`routePanel==='pricing-engine'` render line alongside the other simple route panels.

## 2. MI# now leads every row

Both ranked tables (`ItemRow`/margin tables, `DrainRow`/waste-comp-promo table): the item number
column now comes FIRST and is the bold/gold/monospace primary label; the product description is
now the secondary column. Previously the description led and the MI# was a tiny muted `#123`
afterthought column — easy to miss when trying to tell two similarly-named MI#s (a regular item
vs. a promo-pricing variant of "the same" product) apart, which the owner says is common
("multiple MI #'s for virtually everything").

## 3. Live-measured root cause of "the price looks wrong"

`computeItemMargins()`'s documented rule (dispatch #212's own header, `price-events.js`'s proven
convention): the "current" menuPrice for an item is `MAX(price)` on the single MOST RECENT day
in the caller's window — never an average, since a promo tier sits below menu price the same day.

**What wasn't accounted for**: if that most-recent day is still IN PROGRESS, only whatever price
tiers have rung SO FAR that day are visible in `qsr_product_mix` — `qsrsoft-pmix-pull.yml` runs
twice daily (`~5am CDT "previous day fully closed"`, `~2pm CDT "current-day refresh"`), so a day
can sit in the table for hours as a genuinely partial snapshot before its "closing" pull the
following morning. A MAX(price) computed from a partial day can UNDERSTATE the true day's price,
which understates margin $ and % — exactly "margins seem way off."

**Measured, not assumed** (`memory`'s own standing rule): pulled `qsr_product_mix` for store 3708
directly (service-role, `date` 08-29..08-31, 1000-row sample) and compared each item's latest-day
MAX(price) against its own max across the sampled window. **34 of 359 items** showed a LOWER
MAX(price) on the single latest date (08-31) than on an earlier date in the same short window —
e.g. Sausage McMuffin $1.59 (latest) vs. $2.79 (two days earlier); L Coffee $1.89 vs. $2.49; Ranch
Snack Wrap $2.99 vs. $3.89. A real, deliberate menu-wide price ROLLBACK across dozens of
completely unrelated items (drinks, sandwiches, snacks, service fees) in a single day is not a
plausible business event; an incomplete day's partial data is.

### Fix

New pure helper `clampToLastClosedDay(dataMaxDate, closedCutoff)` in `src/engine/pricing-engine.js`
— returns whichever of the two dates is OLDER: the real data max (so a lagging pull never has
data invented for it) or the last CLOSED business day (`lastClosedBusinessDay()`,
`src/utils/date.js` — the same shared helper this repo already uses everywhere else for exactly
this "don't let a trailing window swallow today's partial day" trap, per that helper's own header
comment: "recurred across the codebase five separate times"). `pricing-engine.js`'s `maxDate`
memo now runs the real data max through this clamp before it becomes `dateRange.end` (and before
it's shown in the "Through {date}" label) — so `computeItemMargins()` never sees an in-progress
day as the window's most recent one.

4 new unit tests (`src/__tests__/pricing-engine.test.js`) cover: clamps an in-progress-day data
max back to the closed cutoff; keeps a real, older data max untouched when the pull is lagging;
passes through when the two are equal; passes through `null`/`undefined` unchanged.

## 4. Item / custom combination cost lookup (same day, follow-up)

Owner: *"I would definitely like the ability to look up the food and paper cost on any item,
value meal, or custom created combination of items."*

Any single item or value meal already has its own row in `displayRows` (a combo SKU carries its
own price/cost, per dispatch #212's trap 3 — a "Big Mac Meal" is not derived from "Big Mac" +
fries + drink, it's its own item_number) — so a search box against the existing per-item data
already serves "any item or value meal." The genuinely new piece is a CUSTOM combination with no
item_number of its own (e.g. "what would 2 Big Macs + a large fry cost me").

- New pure function `computeComboCost(itemRows, picks)` (`src/engine/pricing-engine.js`) — sums
  each picked item's own unit food/paper cost × qty. Deliberately does NOT invent a suggested
  combo price: a real value meal prices below the sum of its parts, so summing `menuPrice` into
  a "combo price" would be actively misleading. Returns the component-price sum as a labeled
  reference figure only (`Σ Component Price`); the operator enters the real combo/value-meal
  price separately if there is one. 5 new unit tests.
- New UI: `LookupTab` in `src/views/pricing-engine.js`, reached via a new "🔎 Item Lookup" /
  "📊 Rankings" tab strip inside the Pricing Engine panel (the Rankings tab is the pre-existing
  behavior, unchanged). Search by MI# or name → each result shows price/food+paper cost/margin %
  with an "＋ Add" button; a "Custom Combination" tray at the bottom lists added items with a qty
  stepper and remove button, running Food Cost / Paper Cost / Total Cost / Σ Component Price
  totals, and an optional "actual combo price" input that computes real margin $ and % once
  entered.
- **Not interactively verified in a live browser** (per this repo's own "don't claim UI success
  you haven't tested" rule) — this codebase has no component-rendering test harness (jsdom-less
  Vitest, confirmed by every other panel test file in `src/__tests__`), so verification here is:
  the pure `computeComboCost` logic is unit-tested (5 tests), the build compiles clean, and the
  JSX was manually re-read end-to-end for reference errors — but nobody has clicked through it in
  a real browser yet. Worth a real click-through before or shortly after merge.

## What this does NOT change

- No change to the core `MAX(price)`-per-day rule itself — proven correct, not touched.
- No change to the wrap-combo halving, combo-vs-component grouping, or low-volume-noise handling
  (traps 2-4 from dispatch #212) — none of those are implicated in this finding.
- Does not address the bigger Pricing Engine roadmap (elasticity/what-if simulator, Martin
  Brower/distributor cost feed, recipe/BOM, combo composition, cross-store price-point
  comparison, RFM tie-in) — those are queued separately; see the owner's 2026-09-01 message and
  `memory/finding-legacy-pricing-workbook-structure-2026-08-27.md` (the prior investigation into
  the owner-supplied legacy pricing workbook's structure) as the starting point for that
  follow-on work.
