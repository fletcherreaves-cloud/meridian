# Dispatch #186 — wire the eBOS "Menu Items" list endpoint; resolves #185's ID-enumeration blocker

## Context — the owner captured the exact missing endpoint

Dispatch #185 shipped as docs-only (`memory/finding-menu-item-id-enumeration-2026-08-28.md`)
because no known request enumerates `store_menuitem_id` for a store's full menu — blocking any
real pull of `menu_item_activity2`/`menu_item_activity_cost`. The owner has now captured it live
(2026-08-28, DevTools on `v3.myqsrsoft.com`):

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menuitems
Response: [ { "data": 4194793, "value": "1 - Hamburger" },
            { "data": 4194824, "value": "2 - Double Hamburger" }, ... ]
```

`data` = `store_menuitem_id` (the same ID space already confirmed against
`menu_item_activity2`/`menu_item_activity_cost` in dispatch #185 — `4194793` matches exactly).
`value` = `"{item_number} - {description}"`. Response headers confirm the same auth/app header
family already sent by `ebosGetObj()` in `scripts/qsrsoft-variance-pull.mjs`
(`access-control-expose-headers` lists `x-auth-token`, `x-current-nsn`, `X-eBos-AppName`,
`X-eBos-AppVersion`, `X-eBos-Sidebar`) — **no new auth path, this is a GET on the existing
`ebosGetObj(token, nsn, 'menuitems')` shape**, one call per store, no date-range params.

The captured sample (store 3708, saved verbatim at
`memory/captures/menu-items-list-2026-08-28.json`) returned **5,466 rows**, `data` values unique
1:1 to `item_number` (verified — no `item_number` maps to more than one `store_menuitem_id`).
Item numbers range 1–98010. This is almost certainly the store's **full definable catalog**, not
just currently-active POS items — expect a large minority of rows to be non-food or dead entries
(spot-checked: ~28 "Do Not Use", ~17 "Apparel N", ~15 toy SKUs, a couple of "Test" fundraiser
items, one bare "Shirt", ~54 genuine surcharge line items). **Do not treat this as "the store sells
5,466 things"** — most of that catalog is inactive/non-food, and pulling daily activity for all
5,466 IDs × 27 stores would be a large, mostly-wasted daily request volume.

## Task

1. **Wire the pull itself** — extend `scripts/qsrsoft-variance-pull.mjs` (or a sibling script if
   the cadence genuinely doesn't fit that loop's shape — check first, per "check whether a helper
   exists before writing one") with `ebosGetObj(token, nsn, 'menuitems')`, one call per store, no
   date params. This is catalog/reference data, not a daily time series — **do not run it on the
   same daily cadence as `raw_detail`/`raw_info`**; a catalog like this changes rarely. Use your
   judgment on cadence (weekly is a reasonable default) but state the choice and why in the PR.
2. **New Supabase table**, e.g. `qsr_menu_items`, keyed `(loc, store_menuitem_id)`, columns
   `item_number` (int, parsed from the `value` prefix) and `description` (parsed remainder) +
   `tenant_id` + full RLS, matching every other stream (CLAUDE.md standing rule). Upsert full
   replace per store per run (the whole point is this becomes the lookup/reference table other
   pulls key off of).
3. **Resolve the open scoping question this list itself raises**: cross-reference the captured
   sample (or a live pull if you have credentials this session) against already-pulled tables that
   carry an item number in this same space — `qsr_product_mix` (`price-events.js`, `item` field)
   and/or `raw_info`'s `menu_items[].item_number` (dispatch #184, once `qsr_raw_item_info` starts
   landing rows — the schema SQL is now live per the owner, confirm it's actually populating before
   relying on it). The goal: determine which subset of the 5,466 catalog rows are items the store
   has ACTUALLY sold recently (say, last 90 days), so a future pull of `menu_item_activity2`/
   `menu_item_activity_cost` (dispatch #185's original goal — still out of scope to wire in THIS
   dispatch, see below) can be bounded to that real-activity subset instead of the full catalog.
   Report the resulting subset size per store in the PR body — this is the number the volume
   decision in a follow-up dispatch will be made against.
4. **Do NOT wire `menu_item_activity2`/`menu_item_activity_cost` in this dispatch.** This dispatch
   is scoped to landing the catalog/lookup table and answering the filtering question. Once the
   real-activity subset size is known (task 3), a follow-up dispatch sizes and ships the actual
   per-item daily activity+cost pull against that bounded set — matching dispatch #179's own
   discipline of measuring before committing to a full-volume pull.
5. Add this new stream to the standing "new automated pull" checklist (CLAUDE.md Dev Rules):
   `sync-failure-watch.yml`'s `workflows:` list (confirm whether it needs its own entry or rides
   the same workflow as the variance pull) and `stream-freshness.js`'s `STREAMS` array.

## Verification

- A real live call (name credential/method per "measure it, don't reason about it") proving
  `qsr_menu_items` lands real rows for at least one store.
- The task-3 cross-reference number (how many of the 5,466 catalog rows are actually
  recently-active per store) — this is the dispatch's real deliverable, not just the table.
- Standard suite + build.

## Out of scope

- Wiring `menu_item_activity2`/`menu_item_activity_cost` — follow-up dispatch, sized against this
  one's task-3 output.
- Any Pricing Engine UI/analysis.
- Re-investigating dispatch #183's audit-rows reconciliation (unrelated).
