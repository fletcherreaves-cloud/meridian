# Finding: real-activity subset of the menu-item catalog (dispatch #186 task 3)

**Verdict: a bounded `menu_item_activity2`/`menu_item_activity_cost` pull needs ~330-390
items/store, not the full ~5,466-row catalog — a ~6-7% slice.**

## Measurement

`scripts/measure-menu-item-activity-subset.mjs`, run live 2026-08-28 against
`SUPABASE_SERVICE_ROLE_KEY` (this session's credential — `content-range: 0-0/2526181` on
`qsr_product_mix`, calibrated against a `42703` on a deliberately fake column, same three-way
check CLAUDE.md's standing rule asks for).

**True cross-reference (store 3708 — the one store with a real captured catalog,
`memory/captures/menu-items-list-2026-08-28.json`, 5,466 rows, 5,466 unique `item_number`s):**

| | value |
|---|---|
| catalog size | 5,466 |
| distinct items sold in `qsr_product_mix`, last 90 days | 331 |
| of those, found in the catalog | 329 (99.4%) |
| of those, NOT found in the catalog | 2 (`item_number` 25125, 25127 — not investigated further, see Caveat below) |
| **real-activity subset** | **329 / 5,466 (6.0%)** |

The 99.4% match is the sanity check this measurement leans on: a POS cannot sell an item that
isn't in the store's own menu-item catalog, so "distinct items sold recently" should be ~a
subset of "catalog item_numbers" by construction. It very nearly is.

**Per-store active-item counts (`qsr_product_mix`, last 90 days, all 27 stores — real, live,
no catalog needed for this half since every store's own qsr_product_mix is already populated):**

| loc | nsn | active (90d) |
|---|---|---|
| 0003708 | 3708 | 331 |
| 0005183 | 5183 | 356 |
| 0005985 | 5985 | 345 |
| 0006178 | 6178 | 338 |
| 0006838 | 6838 | 350 |
| 0006972 | 6972 | 331 |
| 0010034 | 10034 | 363 |
| 0010422 | 10422 | 344 |
| 0010915 | 10915 | 352 |
| 0011657 | 11657 | 344 |
| 0013113 | 13113 | 338 |
| 0018213 | 18213 | 292 |
| 0020475 | 20475 | 327 |
| 0024471 | 24471 | 348 |
| 0029760 | 29760 | 345 |
| 0031357 | 31357 | 335 |
| 0032525 | 32525 | 333 |
| 0033109 | 33109 | 342 |
| 0033222 | 33222 | 329 |
| 0033704 | 33704 | 337 |
| 0034222 | 34222 | 342 |
| 0035064 | 35064 | 335 |
| 0035242 | 35242 | 356 |
| 0037566 | 37566 | 368 |
| 0038609 | 38609 | 385 |
| 0043380 | 43380 | 311 |
| 0043701 | 43701 | 366 |

Sum across all 27 stores: **9,241**. Average: **342.3/store**. Range: 292–385.

Since every sold item is necessarily a catalog item (confirmed at 99.4% above), these 26 other
stores' active-item counts are themselves the practical real-activity subset size for that
store — they just haven't been individually cross-referenced against that store's own captured
catalog (only 3708's was owner-captured). Re-run
`node scripts/measure-menu-item-activity-subset.mjs` once `qsr_menu_items` has real rows for
all 27 stores (dispatch #186 ships the pull; a weekly run lands them) to get the true
per-store cross-reference instead of this proxy — the script auto-upgrades to the DB
cross-reference the moment a store has rows, no code change needed.

## Sizing implication for the follow-up dispatch

A daily `menu_item_activity2`/`menu_item_activity_cost` pull bounded to each store's own
recently-active subset is **~330-390 requests/store/day** (2 endpoints × ~340-390 items — NOT
2 × 5,466), a ~15x reduction from a full-catalog pull. That's the number
dispatch #186's own scope note said a follow-up dispatch should size against.

## Caveat — not chased further, flagged for whoever sizes the follow-up

Store 3708's 2 "sold but not in the captured catalog" items (25125, 25127) could be a genuine
mid-year catalog change (item added/recoded after the menu-items list was captured, or before
the qsr_product_mix window) or an edge case in the ID space. Immaterial to the 6.0% headline
number (2 of 331) — not investigated further, per this dispatch's own scope boundary (task 3 is
sizing, not a full audit of the two ID spaces' edge cases).

## What still blocks a TRUE per-store cross-reference for the other 26 stores

`qsr_menu_items` (dispatch #186's new table) did not exist in Supabase as of this measurement
(`PGRST205: Could not find the table 'public.qsr_menu_items'` — measured live, same credential
as above). The schema (`supabase/schema-qsr-menu-items.sql`) needs the owner to apply it in the
Supabase SQL editor before the pull script can write real rows, same handoff dispatch #184's
`qsr_raw_item_info` used. Once applied and the weekly pull has run for all 27 stores, re-running
this measurement script upgrades every store from the `qsr_product_mix`-only proxy to the real
DB cross-reference automatically.
