# Dispatch #184 — wire the eBOS "Raw Item Info" endpoint: recipe/serving-factor + current cost data

## Context — the owner captured this live, real DevTools request

Owner-supplied (2026-08-28), captured via DevTools on `v3.myqsrsoft.com`'s "Raw Item Detail
Information" button:

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/raw_info/{raw_item_id}?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Headers: X-Auth-Token, X-Current-Nsn, Accept: application/json,
         Origin: https://v3.myqsrsoft.com, Referer: https://v3.myqsrsoft.com/
```

**This is the SAME auth/domain/header shape `ebosGetObj()` in `scripts/qsrsoft-variance-pull.mjs`
already implements** (confirmed by reading it — `ebosGetObj(token, nsn, path)` builds
`${EBOS_BASE}/api/inv/${nsn}/${path}` with the identical header set the owner's curl shows). This
is a genuine sibling of the ALREADY-WORKING `raw_detail/{id}` call in that same script (line
~347), which already fetches per-WRIN forensic detail for the top-N (currently 50, per dispatch
#179) highest-variance WRINs per store, keyed by the exact same `rawItemId` field already present
on every `varRows` row (`v.rawItemId`, `qsr_variance_stat.raw_item_id`). **No new auth path, no
new ID discovery — this can reuse the existing loop verbatim, just calling one more endpoint per
item already being visited.**

## Why this matters — closes real gaps from the legacy pricing-workbook finding

`memory/finding-legacy-pricing-workbook-structure-2026-08-27.md` (the owner's 2008-2017 pricing
tool, structure only, all data stale) identified 5 concrete data-pull gaps blocking a modern
Pricing Engine. The owner's captured response (a real, live sample for store 3708, item 1385962 /
"100% PURE BEEF") closes or partially closes THREE of them in one endpoint:

- **Gap #1 (distributor ingredient cost — "no current source at all")**: `latest_case_price`,
  `case_price_avg`, `case_qty`, `primary_vdr_name`, `primary_vdr` (a vendor ID), `mid_range_yield`.
  Real current cost data, per raw item, per store.
- **Gap #2 (recipe/BOM data)**: `menu_items[]` — every menu item this raw item feeds into, with
  `recipe_serving_factor` per item and `on_pos` (Y/N, currently sellable). This is exactly the
  "Serving Factors" tab from the legacy workbook, live and current.
- **Gap #4 (combo/EVM composition, partial)**: `menu_item_combos[]` — combo items that include
  this raw item's menu item as `main_item_number`, with `quantity`. Doesn't give the FULL combo
  composition (e.g. what side/drink comes with it), but does give the combo→main-item linkage.

Also present: `upt_hist` (a date/price history array — sparse in the one sample seen, one entry
"July 2019" — worth checking whether a wider `start_date`/`end_date` range returns more), and
`current_upt`/`case_price_avg` for pricing-trend potential.

## Task

1. Extend `scripts/qsrsoft-variance-pull.mjs`'s existing per-store loop: for the SAME `actionable`
   WRIN set already selected for the `raw_detail/{id}` call (top-50 by |$| variance, per dispatch
   #179 — reuse this set, don't build a new selection), add a sibling call:
   `ebosGetObj(token, nsn, `raw_info/${v.rawItemId}?${range}`)`. This doubles the per-item request
   count in that loop (currently ~50/store for `raw_detail`; this adds ~50 more for `raw_info`) —
   measure the real timing impact the same way dispatch #179 did (via this workflow's own GitHub
   Actions run history, or a live timed run if you have eBOS credentials this session) before
   shipping, and confirm it stays comfortably under the workflow's timeout with margin, not just
   "should be fine."
2. New Supabase table, e.g. `qsr_raw_item_info`, upserted on `(loc, wrin)` (matching the sibling
   `qsr_raw_item_detail` table's keying convention) with `tenant_id` + RLS like every other stream
   (CLAUDE.md standing rule). Promote the fields most likely to be queried directly to real
   columns (`full_wrin`, `long_desc`, `invty_category_type`, `case_qty`, `latest_case_price`,
   `case_price_avg`, `primary_vdr_name`, `primary_vdr`, `mid_range_yield`, `recipe_item`,
   `current_upt`), and store `menu_items`, `menu_item_combos`, `upt_hist` as JSONB arrays —
   matching the existing `qsr_raw_item_detail.history` JSONB precedent, don't invent a new
   normalization scheme for this first slice.
3. Quick side-check (not a blocker, just worth confirming): does varying `start_date`/`end_date`
   actually change the response (e.g. a wider `upt_hist`), or is this effectively a
   point-in-time/current-state endpoint regardless of the date params? Note whatever you find in
   the PR body — it affects whether this needs a rolling re-pull or is a one-time-per-item refresh.
4. Add this new stream to the standing "new automated pull" checklist (CLAUDE.md Dev Rules):
   register it in `.github/workflows/sync-failure-watch.yml`'s `workflows:` list (it likely rides
   the SAME workflow as the existing variance pull, `qsrsoft-variance-pull.yml` — confirm whether
   this needs its own entry or is already covered since it's the same script/workflow), and add
   its `dsField` to `stream-freshness.js`'s `STREAMS` array so a dead pull doesn't go unnoticed
   the way LifeLenz once did.
5. **Do NOT build any UI/panel consumption of this data in this dispatch** — this is the pull +
   storage slice only. The Pricing Engine itself (reading this data, building the actual
   pricing/margin analysis the legacy workbook did) is future work once this data is flowing.

## Verification

- A real live call (via `workflow_dispatch` with `debug=1` if you don't have direct eBOS
  credentials this session, matching how dispatch #177's engineer worked around the same
  constraint) proving the new endpoint call lands correctly in `qsr_raw_item_info` with real data
  — name the credential/method used, per this repo's "measure it" rule.
- Confirm the existing `raw_detail`/`qsr_raw_item_detail` path is completely unaffected — this is
  an ADDITION to the loop, not a replacement.
- Real before/after timing measurement for the per-store loop (per Task 1) — this is the actual
  risk this dispatch introduces to a production scheduled pull.
- Standard suite + build.

## Out of scope

- Any Pricing Engine UI, panel, or analysis logic consuming this new table.
- Widening the WRIN selection beyond the existing top-50 set (a natural future step once this
  slice is proven — the legacy workbook's recipe/cost data would ideally cover the full catalog,
  not just high-variance items, but that's a bigger request-volume commitment deserving its own
  measurement, matching dispatch #179's own scope discipline).
- Gaps #3 (per-item waste quantity) and #5 (item-code stability) from the legacy pricing-workbook
  finding — untouched by this endpoint, still open.
