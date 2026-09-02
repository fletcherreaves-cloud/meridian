// @ts-nocheck
export default {version:'5.322', date:'2026-09-02', changes:[
  'New automated pull: Product Outage (backlog item K, memory/data-acquisition-shopping-' +
  'list.md) -- "the cheapest pull in the catalog," one HTTP request covering all 27 stores ' +
  'across a whole date range. No current Meridian panel can express an unavailable item at ' +
  'all; joined to qsr_product_mix on (loc, dt, item) this eventually turns "Fried Apple Pie ' +
  'was flagged unavailable at five stores" into lost-sales dollars at each store\'s own sell ' +
  'rate (that join/UI is deliberately NOT built in this pull -- see the schema/script headers).',
  'reportType=allOutages, never currentOutages -- allOutages WHERE restored_ts IS NULL ' +
  'reconciles exactly to currentOutages (verified live on the owner\'s own capture), and ' +
  'currentOutages alone is only the still-open tail, an ~12x undercount of real volume. Keyed ' +
  'on (loc, dt, item, outage_ts), not (loc, dt, item) -- an item can go out, get restored, and ' +
  'go out again the same day. outage_ts/restored_ts stored WITHOUT a timezone deliberately: ' +
  'the raw feed is a per-store hourly POLL time (every store\'s timestamps end on the same ' +
  'minute, outage and restore alike), not the real moment a manager acted -- attaching a ' +
  'timezone would fabricate precision this data doesn\'t have.',
  '⚠️ An outage row is a manager\'s POS action (machine down / needs cleaning), NOT a measured ' +
  'out-of-stock -- there is no reason code on the record (vendor KB confirmed). This pull never ' +
  'labels or infers cause; stores the raw event only, per the owner\'s own 2026-08-15 caution.',
  'scripts/qsrsoft-product-outage-pull.mjs: two-path auth (getFreshToken() direct mint -> ' +
  'Playwright fallback, same ladder as qsrsoft-pmix-pull.mjs), first-run backfill to ~370 ' +
  'days (vendor KB confirms a year of history is available -- built backfill-capable from day ' +
  'one, not forward-only), steady-state 30-day rolling re-pull (an outage opened weeks ago can ' +
  'still restore later). New table qsr_product_outage (schema given to the owner to run -- no ' +
  'DDL execution access from this session), watched workflow, loadQsrProductOutage() added to ' +
  'src/lib/supabase.js for future consumption. Full suite (3709 tests) and build both clean.',
]};
