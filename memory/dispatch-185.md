# Dispatch #185 — wire per-menu-item daily activity + $ cost (waste, emp/mgr meal, food/paper cost)

## Context — two owner-captured DevTools requests, same ID space, clearly paired

Owner-supplied (2026-08-28), captured live on `v3.myqsrsoft.com`:

**1. Menu Item Activity** (POST, per-day, per-menu-item counts):
```
POST https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity2
Body: {"store_menuitem_id":4194793,"start_date":"2026-08-28","start_time":"00:00",
       "end_date":"2026-08-28","end_time":"23:45","item_long_desc":"1 - Hamburger"}
Response: { "currentBusinessTime": "06:06", "getMenuItemActivity": [
  { "date_range":"2026-08-28", "activity":0, "sold":0, "emp_meal":0, "mgr_meal":0,
    "waste":0, "promo":0, "free_choice_qty":0, "datetime_range":"Fri - 08/28/2026 | 00:00 to 23:45" } ] }
```

**2. Menu Item Activity Cost** (GET, per-day, per-menu-item $ cost):
```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/menu_item_activity_cost?store_busn_dt=2026-08-28&menu_item_id=4194793
Response: { "food_cost": 0.6292658241696025, "paper_cost": 0.015955,
            "total_cost": 0.6452208241696026, "last_close_business_date": "2026-08-27" }
```

Same `X-Auth-Token`/`X-Current-Nsn` auth as every other eBOS endpoint already pulled by
`scripts/qsrsoft-ebos-pull.mjs`/`scripts/qsrsoft-variance-pull.mjs` — no new auth path. Both
endpoints key off the SAME id (`store_menuitem_id` in the first call, `menu_item_id` in the
second — confirmed the same value, `4194793`, in both captures) — a **store-specific internal
menu-item ID**, distinct from `raw_info`'s `menu_items[].item_number` (e.g. `1` for "Hamburger" —
a smaller POS item code). These two IDs are NOT the same ID space; do not assume `item_number`
can be passed directly as `store_menuitem_id`.

**A third, related capture confirms the same ID family at finer granularity**:
`POST .../menu_item_activity_breakdown` (body: `{store_menuitem_id, date, start_time, end_time}`)
returns the SAME fields (`activity`/`sold`/`promo`/`mgr_meal`/`emp_meal`/`free_choice_qty`/
`waste`) sliced into 15-minute increments across a 48-hour window (`timeslice` running past
`24:00:00`, matching this repo's 4am-ABC-business-day convention). This is the same underlying
data as `menu_item_activity2` at a much finer (and much higher-volume) grain — **do not pull this
breakdown endpoint for this dispatch's purposes; the daily `menu_item_activity2` total is the
right level for Pricing Engine cost/margin work.** Noted here only so a future dispatch needing
intraday per-item detail doesn't have to rediscover it.

## Why this matters

Together with dispatch #184 (the `raw_info` endpoint, recipe/serving-factor + current ingredient
cost), this closes **gap #3** (per-item waste quantity — previously "no current source at all")
from `memory/finding-legacy-pricing-workbook-structure-2026-08-27.md`, and adds something that
finding didn't even have a gap number for: **`menu_item_activity_cost` is a real, per-item,
per-day, QSRSoft-computed food+paper cost** — this is close to the actual missing link for a
modern Pricing Engine (item-level cost vs. price = margin), not just a cost-input atom.

`menu_item_activity2`'s `emp_meal`/`mgr_meal` fields are ALSO a third, independent, per-item
data point on employee/manager meals — worth flagging to whoever next touches dispatch #181's/
#183's emp-meal reconciliation work as a possible third ground truth, but do not fold that
investigation into this dispatch; note it in the finding write-up (if you produce one) and leave
the reconciliation itself alone.

## Task — this needs a real ID-resolution answer before it can be wired as a pull

1. **The open question, first**: how do you enumerate ALL `store_menuitem_id` values for a store,
   for all its active menu items? Check:
   - Whether `raw_info`'s response (dispatch #184, once that lands — or the sample already in
     this doc) has any field that maps `item_number` → `store_menuitem_id`, even indirectly.
   - Whether the eBOS front-end has a "menu items list" page/endpoint (check `qsrsoft_kb` for
     anything describing one) that would return this mapping for a whole store in one call.
   - Whether `qsr_daily_activity`/`qsr_product_mix` (already-pulled tables) carry a menu-item ID
     in this same ID space that could be reused instead of a fresh lookup.
   **If no clean enumeration path is found**, this dispatch cannot wire a real pull — write up
   what was checked and what's still needed (most likely: one more owner DevTools capture of
   whatever page/action lists a store's menu items with their internal IDs) rather than guessing
   or hardcoding a small sample set.
2. **If an enumeration path is found**: wire both endpoints into a new pull (either extend
   `qsrsoft-variance-pull.mjs`/`qsrsoft-ebos-pull.mjs` if the loop shape fits naturally, or a new
   script if the per-menu-item iteration is different enough — use your judgment, but check
   existing scripts first per "check whether a helper exists before writing one"). New Supabase
   table(s) (e.g. `qsr_menu_item_activity`), `tenant_id` + RLS, keyed by
   `(loc, store_menuitem_id, date)`. Store `food_cost`/`paper_cost`/`total_cost` alongside
   `activity`/`sold`/`emp_meal`/`mgr_meal`/`waste`/`promo`/`free_choice_qty` — one row per
   item/day covers both endpoints' data.
3. **Measure request volume before shipping**: this is PER MENU ITEM (potentially dozens per
   store) PER DAY — a materially larger multiplier than the WRIN-level pulls (dispatch #179's
   top-50 WRINs is a small, dollar-filtered subset; a full menu-item catalog per store per day
   could be much larger). Do the same real-timing measurement dispatch #179 did before committing
   to a daily-per-store-per-item pull — if the volume is too large for a daily full-catalog pull,
   propose a bounded first slice (e.g. top-N menu items by sales volume, or a less-frequent
   cadence) rather than shipping something that risks the pull's timeout or the API's rate limits.
4. **Do NOT build any Pricing Engine UI/analysis in this dispatch** — pull + storage only, same
   discipline as #184.

## Verification

- If the ID-enumeration question is answered and a pull ships: a real live call proving data
  lands correctly (name the credential/method, per this repo's "measure it" rule), real timing
  measurement for whatever scope you land on, standard suite + build.
- If the ID-enumeration question is NOT answered: the finding write-up is the deliverable — name
  exactly what's needed next (most likely: an owner capture of a menu-items-list request).

## Out of scope

- Dispatch #184's `raw_info` endpoint — separate, different ID space, may be landing in parallel.
- Folding the `emp_meal`/`mgr_meal` fields here into dispatch #181's/#183's reconciliation work —
  note the lead, don't chase it here.
- Any Pricing Engine analysis/UI consuming this data.
