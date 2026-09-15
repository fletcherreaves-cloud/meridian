// @ts-nocheck
export default {version:'5.446', date:'2026-09-15', changes:[
  'Records ("Best Day Sales" and district all-time champions) can now reach back to 2022. Owner ' +
  'request: "I need you to go back to 2022 for records data please." ' +
  'computeRecords/scopeRecordData (engine/record-day.js) already scan an unbounded historical ' +
  'range -- the real limiter was that the laborRows array (the fallback source once ' +
  'qsr_daily_activity_rollup\'s own auto-pull only reaches back to 2024-01-01) was only eagerly ' +
  'loaded ~400 days back at app startup. Measured live against Supabase: the labor_rows table ' +
  'already holds real 2022 data (9,074 rows for 2022 alone, sales populated) -- a fetch-depth ' +
  'problem, not a missing-data one, so no QSRSoft API backfill was needed.',
  'Fixed by reusing the existing "wide tier" lazy-fill mechanism dispatch #170 built for Product ' +
  'Mix\'s 90D/180D/All range options (metric-source.js\'s ensureLazyFillWide/wideLoaders) -- ' +
  'App.js now registers a laborRows wide loader anchored to a fixed calendar date (2022-01-01, ' +
  'computed dynamically so "since 2022" stays accurate as today\'s date moves forward, never a ' +
  'round day-count that would drift). Both the Record Days panel (main-menu Records tab) and ' +
  'each store\'s Records drill-down (Store Analytics) got a new "🕰 Load full history (since ' +
  '2022)" button -- on-demand, not an eager load added to every session\'s startup path.',
  '13 new/extended tests (dispatch-records-2022-history-2026-09-15.test.js), including a real ' +
  'end-to-end check that the resolved deep fetch produces the correct 2022 all-time record ' +
  'through the actual metric-source.js resolver, not a mocked stand-in. Also fixed two existing ' +
  'Records tests (dispatch-103, dispatch-130) whose metric-source.js mocks fully replaced the ' +
  'module instead of using importOriginal, which would have broken on this change\'s new ' +
  'imports -- switched both to the importOriginal pattern dispatch-200\'s test already used.',
  'Full suite 515/515 files, 4939/4939 tests (1 pre-existing, unrelated date-boundary flake in ' +
  'eom-share-links-manage.test.js). Build clean, eager payload 547.54 KB / 850 KB budget (flat).',
]};
