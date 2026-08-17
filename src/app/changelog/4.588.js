// @ts-nocheck
export default {version:'4.588', date:'2026-07-29', changes:[
  'Extended the recent-data fix to every large cloud read: the emailed Daily-Glimpse, Cash, Sales-Ledger and the manual Labor streams now also load newest-first, so Service (OEPE/KVS), Controls, and Labor % repopulate for the current window even when a read is throttled. (The emailed pipeline was healthy the whole time — the data was being written; the app just wasn\'t reading the newest rows.)',
  'Added a "⚠ Daily data is N days stale" guard banner to the Leadership One-Pager: if the freshest sales/speed/labor date is more than 2 days behind today, the form warns you (with the newest date) instead of quietly printing incomplete numbers.',
]};
