// @ts-nocheck
export default {version:'5.496', date:'2026-10-06', changes:[
  'LifeLenz sync: fixed a gap-detection bug that permanently stranded any day lost to a sync ' +
  'outage longer than 3 days (owner-reported -- store 6972\'s MBI vs LifeLenz Accuracy panel ' +
  'showed Sep 25 at ~20% of forecast and Sep 26 fully missing; measured the same uniform ~20-30% ' +
  'ratio district-wide across all 27 stores). Root cause: lifelenz-pull.mjs\'s getLatestDate() ' +
  'read the whole table\'s MAX(date), which is always ~14 days ahead of "today" because of the ' +
  'script\'s own forward-schedule horizon -- so the "smart gap detection" always collapsed to a ' +
  'fixed 3-day lookback, regardless of real outage length. The Sep 26-29 token-expiry outage ' +
  '(5 days) pushed Sep 25/26 outside that window by the time sync resumed Sep 30, so nothing ' +
  'ever re-pulled them. Fixed getLatestDate() to find the latest date strictly before today with ' +
  'a confirmed (non-null) actual -- daysSince now correctly scales with real outage length, so ' +
  'any future gap self-heals the next time the sync succeeds. Backfilled the live Sep 25 onward ' +
  'gap via workflow_dispatch(start_date=2026-09-25).',
  '4 new tests (dispatch-lifelenz-gap-detection-2026-10-06.test.js), mocking the Supabase query ' +
  'builder to assert the real filters sent. Full suite: 5268/5268 passing. Build clean, eager ' +
  'payload 555.59 KB gzip (budget 850 KB) -- unchanged, this is a scripts/ change only.',
]};
