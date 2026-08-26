// @ts-nocheck
export default {version:'5.188', date:'2026-08-26', changes:[
  'Fixed the Product Mix Dashboard\'s Cloud tab, which showed "No Cloud Product Mix Data" no '
  + 'matter how much data existed. Root cause: qsr_product_mix has 2.5M+ fresh rows (confirmed '
  + 'live via service-role read, max date the prior day), but `ProductMixPanel` '
  + '(src/views/labor-tools.js) never called `ensureLazyFill(\'pmixRows\')` -- pmixRows is a '
  + 'LAZY_FILL_SOURCES entry (metric-source.js), only reachable on an explicit "load on open" '
  + 'call, same contract as auditRows/wasteRows. labor-tools.js never imported that function at '
  + 'all, so `ds.pmixRows` stayed permanently empty regardless of what Supabase held -- the '
  + 'panel\'s own "hasn\'t landed any rows yet" message was simply false.\n\n'
  + 'Wired in the same ensureLazyFill/isLazyFillPending/isLazyFillError pattern already used by '
  + 'analytics.js\'s waste-discipline and audit-register consumers: triggers the fetch on open, '
  + 'shows a real "Loading Product Mix..." state on the Cloud tab (and "(loading...)" on its tab '
  + 'label) instead of a false empty state while the fetch is in flight, and distinguishes a '
  + 'failed cloud read from a genuinely-empty one. Left the pre-existing Cloud/Manual default-tab '
  + 'behavior untouched (dispatch-114-product-mix-cloud.test.js encodes it deliberately -- a '
  + 'store with real manual data already uploaded shouldn\'t default to an empty/loading Cloud '
  + 'tab); the actual bug was that Cloud never worked even when a user clicked it themselves.',
]};
