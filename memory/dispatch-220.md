# Dispatch #220 — Pricing Engine enrichment: waste/comp/promo breakdown per item

## Context — the block dispatch #212 named is gone; re-measured live, not assumed

Dispatch #212 (Pricing Engine first slice, per-item margin from `qsr_product_mix`) explicitly
deferred `qsr_menu_item_activity`'s waste/emp-meal/mgr-meal/promo enrichment: *"that table is
still early (2 days/6 stores as of this scoping pass)... A later enrichment dispatch once that
pull's coverage catches up, not a blocker here."* Re-measured live today (2026-08-30), and this
is a real, worth-recording correction to that earlier read, not just a status update: **a first
pass at this same check today wrongly read `qsr_menu_item_activity` as still only 6 stores** —
that was PostgREST's default 1000-row response cap silently truncating an unpaginated `select`
(the exact trap this repo's own CLAUDE.md names for `loadQsrActSummary`), not a real gap. A
properly paginated count, and independently the pull workflow's own run log
(`qsrsoft-menu-item-activity-pull.yml`, run `33259953752`, 2026-08-29), both show **27/27 stores,
0 skipped, 4077 rows saved**. The real current shape: **27/27 stores, 2 calendar days deep**
(`2026-08-27` → `2026-08-28`, growing by one day on each future daily run, `50 10 * * *` UTC
cron). Coverage-by-store is genuinely caught up; coverage-by-date is genuinely still shallow —
know which one you're reading before trusting either number again.

## The data — `qsr_menu_item_activity`, live-confirmed row shape

`{ loc, store_menuitem_id, date, item_number, activity, sold, emp_meal, mgr_meal, waste, promo,
free_choice_qty, food_cost, paper_cost, total_cost, last_close_business_date, tenant_id,
updated_at }`. `item_number` is the SAME join key `computeItemMargins()`
(`src/engine/pricing-engine.js`, dispatch #212) already returns as `itemNumber` per `(loc,
item_number)` — this is a real, ready-to-join enrichment, not a new data model. `food_cost`/
`paper_cost` here are dispatch #212's own documented finding: *"the SAME QSRSoft-computed number
already in `qsr_product_mix`"* — don't use these as a second/different cost basis, reuse
`computeItemMargins()`'s own `foodCost`/`paperCost` per item for any $ conversion in this
dispatch, so a waste-dollar figure and a margin-dollar figure for the same item are never computed
two different ways.

## Task 1 — engine (`src/engine/pricing-engine.js`, extend, don't fork)

New `enrichItemMargins(marginRows, activityRows, { dateRange } = {})` — takes
`computeItemMargins()`'s existing output plus raw `qsr_menu_item_activity` rows for the same
scope/window, and returns each margin row extended with:
```
{ ...existing margin fields,
  wasteUnits, wasteDollars,         // waste * (foodCost+paperCost) for that item
  compUnits, compDollars,           // (emp_meal + mgr_meal) * (foodCost+paperCost)
  promoUnits, promoDollars,         // promo * (foodCost+paperCost) -- note: this is the FOOD-COST
                                     // side of a promo, not the revenue/discount side; state this
                                     // plainly in the panel copy so it isn't read as "promo cost
                                     // to the P&L" when it's really "cost basis of promo'd units"
  wastePctOfActivity, compPctOfActivity, promoPctOfActivity,  // as a fraction of `activity` (not
                                     // `sold` -- activity is the fuller denominator; sold excludes
                                     // waste/comp/promo by construction, so using it as the
                                     // denominator would make every item's own waste look like a
                                     // bigger share of a shrunken base -- use activity throughout)
}
```
Sum `waste`/`emp_meal`/`mgr_meal`/`promo`/`activity` across every activity row in the window that
matches `(loc, item_number)`, THEN multiply by the item's own `foodCost+paperCost` from the
already-joined margin row (never `activityRows`' own `food_cost`/`paper_cost` columns directly —
per the reuse note above). An item present in `marginRows` but absent from `activityRows` (no
activity data yet for that item/window) keeps all new fields `null`, not zero — a real
never-happened-to-be-active item and a real zero-waste item must stay distinguishable.

Pure function, real unit tests with synthetic fixtures: an item with real waste/comp/promo
volume (assert dollars = units × the item's own margin-row cost, not a second cost source); an
item present in margins but absent from activity (assert null, not 0); an item whose activity
rows span multiple days in the window (assert correct summation, not last-day-only — this is
different from price/cost, which IS last-day-only per #212's own rule; don't conflate the two
aggregation rules).

## Task 2 — loader (`src/lib/supabase.js`, new — none exists today, checked)

`loadQsrMenuItemActivity({ loc, dateRange } = {})` — matches this file's existing loader
conventions (paginated via the shared `fetchAll()` helper — dispatch #218 just made that retry a
transient page failure automatically, reuse it, don't hand-roll a second pagination loop). Scope
by date range and optionally loc, matching how `ProductMixPanel`'s existing loaders already scope
`qsr_product_mix` reads (check that pattern before inventing a new one).

## Task 3 — panel (`src/views/pricing-engine.js`, extend the existing panel from #212)

A third ranked table alongside the two #212 already ships (lowest margin%, biggest $ winners/
losers): **biggest waste/comp/promo dollar drains**, ranked by `wasteDollars + compDollars`
(promo shown as its own column but not folded into the primary sort — per the dollar-basis note
above, promo's $ figure here is cost-side, a materially different read than the other two, and
mixing it into one ranking would blur that). Say the number and the decision (this repo's standing
UI-voice rule) — e.g. "McChicken: $340 in waste this week, 8.2% of its own activity — check
holding times" not just a bare dollar figure. Reuse `LocationSelector`/the existing date-range
tiers already wired into this panel from #212, don't add a second scope picker.

Given the real 2-day-deep date range measured above, the panel's default window should still work
sensibly on day 1 of this feature's life (a 7D/30D tier just returns however many days actually
exist — `enrichItemMargins()` sums whatever's there, doesn't require the tier's full nominal
window) — don't special-case "not enough data yet," let it degrade naturally and grow.

## Verification

- Unit tests per Task 1's engine, covering every case named above.
- A real live measurement (name credential/method): pick 3-5 real items at a real store, hand-
  compute their waste/comp/promo dollars from the raw `qsr_menu_item_activity` rows + the
  matching margin row's cost basis, confirm the panel shows the same numbers — matching this
  repo's "measure it, don't reason about it" rule for anything touching money.
- Confirm `loadQsrMenuItemActivity()` correctly paginates past 1000 rows for a scope that has
  more than 1000 matching rows (the table is at 4217+ rows total already) — this is the exact
  trap this dispatch's own Context section just caught in a hand-run `curl`; the shipped loader
  must not repeat it.
- Panel-contract check (close affordance, LocationSelector, mobile-scroll on the new table).
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Any change to `computeItemMargins()`'s own price/cost/margin math — reuse as-is, this dispatch
  only joins new columns onto its output.
- Backfilling `qsr_menu_item_activity`'s history further back than the pull's own start date —
  this is a genuinely new automated stream (not a case of available-but-unpulled history), it
  grows one day at a time going forward; nothing to backfill.
- A trend/multi-week chart of waste over time — this dispatch is a current-window snapshot/
  ranking, matching #212's own explicit trend-charting deferral.
- Wrap-combo/combo-vs-component corrections applied a second time to activity volumes — those are
  already baked into `computeItemMargins()`'s `volume`; this dispatch's `wasteUnits`/etc. are raw
  `qsr_menu_item_activity` sums and don't need the same correction unless you find live evidence
  they do (state your check either way, don't silently assume it does or doesn't apply).
