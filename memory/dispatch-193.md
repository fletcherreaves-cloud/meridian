# Dispatch #193 — wire the bounded menu_item_activity2/menu_item_activity_cost pull

## Context — the sizing question dispatch #186 was scoped to answer is answered

Dispatch #185 designed the pull (`GET .../menu_item_activity_cost`, `POST .../menu_item_activity2`
— per-item, per-day waste/emp-meal/mgr-meal/food-cost/paper-cost) but couldn't ship it: no known
way to enumerate `store_menuitem_id` for a store, and no idea how many items that would even be.
Dispatch #186 closed both gaps:

- **Enumeration**: `GET /api/inv/{nsn}/menuitems` (now pulled weekly into `qsr_menu_items`,
  `scripts/qsrsoft-menu-items-pull.mjs`) returns the full catalog per store —
  `store_menuitem_id`/`item_number`/`description`.
- **Sizing**: `memory/finding-menu-item-activity-subset-2026-08-28.md` measured, live, against
  `qsr_product_mix` (2,526,181 rows): a store's catalog runs ~5,466 items, but only **292–385
  actually sold anything in the last 90 days** (avg 342.3/store, sum 9,241 across all 27 stores).
  So the real per-store-per-day pull is ~330-390 items, not ~5,466 — a ~15x reduction from a naive
  full-catalog pull.

## Task

1. **Build the item selection query**: for a given store, the set of `item_number`s with any
   `qsr_product_mix` activity in a trailing window (90 days is what dispatch #186 measured with —
   reuse that window unless you find a reason to change it, and say why if you do). Cross-reference
   against `qsr_menu_items` (now live, per dispatch #186 — confirm real rows exist via a live
   query before relying on it, since the pull runs weekly and may not have fired yet since the
   owner applied the schema) to resolve `item_number → store_menuitem_id` for the pull.
2. **Wire the daily pull**: extend an existing eBOS pull script (check `qsrsoft-variance-pull.mjs`
   and `qsrsoft-menu-items-pull.mjs` first — this is DAILY per-item activity data, closer in shape
   to `qsrsoft-variance-pull.mjs`'s cadence than the catalog's weekly one; use your judgment but
   justify the choice) to call, per store, per selected item, per day:
   - `POST /api/inv/{nsn}/menu_item_activity2` (body per dispatch #185's captured sample:
     `store_menuitem_id`, `start_date`/`start_time`/`end_date`/`end_time`, `item_long_desc`) —
     returns `activity`/`sold`/`emp_meal`/`mgr_meal`/`waste`/`promo`/`free_choice_qty`.
   - `GET /api/inv/{nsn}/menu_item_activity_cost?store_busn_dt=&menu_item_id=` — returns
     `food_cost`/`paper_cost`/`total_cost`.
   Use the concurrent-fetch pattern dispatch #184 established (`Promise.allSettled` for the two
   calls per item) rather than sequential awaits.
3. **New Supabase table**, e.g. `qsr_menu_item_activity`, keyed `(loc, store_menuitem_id, date)`,
   `tenant_id` + full RLS matching every other stream. Store `activity`/`sold`/`emp_meal`/
   `mgr_meal`/`waste`/`promo`/`free_choice_qty`/`food_cost`/`paper_cost`/`total_cost` — one row
   covers both endpoints' data per dispatch #185's original design.
4. **Measure real request volume and timing before shipping** — ~330-390 items × 2 calls each ×
   27 stores is a real number (roughly 18,000-21,000 calls/day at the high end); do the same kind
   of live/`workflow_dispatch` timing measurement dispatch #179/#184 did, and confirm it fits
   comfortably in the workflow's timeout. If it doesn't, propose a bounded first slice (e.g. top-N
   items by activity volume per store, not the full active-item set) rather than shipping something
   that risks timing out — state clearly what you chose and why.
5. Register the new stream per CLAUDE.md's standing checklist: `sync-failure-watch.yml` +
   `stream-freshness.js`'s `STREAMS` (check dispatch #184's/#186's own reasoning first for whether
   this EOM/variance-family shape genuinely needs a STREAMS entry — #184/#186 both found it
   doesn't fit that architecture without a bigger `ds` wiring change; if the same applies here,
   say so rather than forcing an entry).
6. **Do NOT build any Pricing Engine UI/analysis** — this is pull + storage only, matching #184's
   and #185's own scope discipline. The margin/cost analysis itself is future work once the data's
   flowing.
7. **Note the third independent emp-meal/mgr-meal data point** this endpoint provides
   (`menu_item_activity2`'s `emp_meal`/`mgr_meal` fields) — dispatch #185 flagged this as
   potentially useful to whoever next touches the #181/#183 emp-meal reconciliation work. Don't
   chase that investigation here; just note it in your PR body if you notice anything interesting
   while building the pull.

## Verification

- A real live call proving the pull lands correct data for at least one store — name the
  credential/method used.
- Real timing measurement for the actual scope you land on (full active-item set, or a bounded
  slice — whichever you choose).
- Standard suite + build. Version bump per convention (check `origin/main` current version first).

## Out of scope

- Any Pricing Engine UI, panel, or margin/cost analysis logic.
- The #181/#183 emp-meal reconciliation investigation — note the lead, don't chase it.
- Widening the item selection beyond active-in-90-days without measuring and justifying it.
