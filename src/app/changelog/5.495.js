// @ts-nocheck
export default {version:'5.495', date:'2026-10-06', changes:[
  'Pace to Target: fixed every store showing a uniform, implausible shortfall for months more ' +
  'than ~2 months back (owner-reported, August 2026 screenshot vs the real Operations Report -- ' +
  'true district Product Sales $8.76M vs the panel\'s own $6.98M, a genuine ~20% understatement, ' +
  'not real underperformance). Two compounding bugs: (1) the salesLedgerRows leg read a field ' +
  '(prodSales) loadSalesLedger() never actually sets, so it silently contributed nothing, every ' +
  'month, always -- fixed to use its real .sales field; (2) both sales sources load with a fixed ' +
  '60-day trailing window from today, so stepping back further via the month stepper silently ' +
  'clipped the viewed month\'s early days out of the total while still claiming full coverage -- ' +
  'fixed with an on-demand fetch (same pattern already used for monthly targets) whenever the ' +
  'loaded data doesn\'t reach the viewed month\'s first day. Confirmed the underlying Supabase ' +
  'data was correct all along (qsr_daily_activity_rollup: 31/31 August days, district total ' +
  'within $626 of the real Operations Report) -- this was purely a client-side loading-window ' +
  'bug, nothing needs backfilling.',
  '3 new tests (dispatch-pace-to-target-window-gap-2026-10-06.test.js). Full suite: 5264/5264 ' +
  'passing. Build clean, eager payload 555.59 KB gzip (budget 850 KB).',
]};
