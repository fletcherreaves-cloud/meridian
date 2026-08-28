// @ts-nocheck
export default {version:'5.234', date:'2026-08-28', changes:[
  'Dispatch #193 -- wired the bounded menu_item_activity2/menu_item_activity_cost pull dispatch ' +
  '#185 designed but couldn\'t ship (no known way to enumerate store_menuitem_id) and dispatch ' +
  '#186 unblocked (GET /menuitems -> qsr_menu_items catalog + a measured ~330-390/store real-' +
  'activity subset, not the full ~5,466-item catalog). New script ' +
  'scripts/qsrsoft-menu-item-activity-pull.mjs (daily cadence, own workflow -- this IS a daily ' +
  'time series, unlike the catalog\'s weekly pull) selects, per store, the item_numbers with ' +
  'qsr_product_mix activity in the trailing 90 days, cross-referenced against qsr_menu_items for ' +
  'store_menuitem_id, then calls both endpoints CONCURRENTLY per item (Promise.allSettled, ' +
  'dispatch #184\'s pattern) and upserts into new table qsr_menu_item_activity (loc, ' +
  'store_menuitem_id, date), tenant_id + full RLS. Pull + storage only, no UI. Registered in ' +
  'sync-failure-watch.yml; left out of stream-freshness.js\'s STREAMS on purpose (same reasoning ' +
  'as the rest of the EOM/variance family -- no ds.xxxRows client wiring exists for this pull to ' +
  'hook into without a bigger architecture change dispatch #184/#186 already declined to force). ' +
  'Also fixed a live-measured bug in dispatch #186\'s own scripts/measure-menu-item-activity-' +
  'subset.mjs: its DB cross-reference read qsr_menu_items with limit=20000 and no Range header, ' +
  'silently truncated by PostgREST\'s server-side 1000-row cap to the store\'s first 1000 catalog ' +
  'rows (measured live: content-range 0-999/* on a 5,466-row catalog) -- understating store ' +
  '3708\'s true in-catalog count as 140 instead of 329. Now paginates like every other script in ' +
  'this repo; re-run reproduces the original capture-file-based 329/331 (99.4%) number ' +
  'independently via the real DB path.',
]}
