// @ts-nocheck
export default {version:'5.842', date:'2026-11-21', changes:[
  '**Egress Phase 1 pilot #3: salesLedgerRows joins the cache-first render, and a real ' +
  'pre-existing bug in glimpseRows/cashRows caching is fixed in the same pass.** ' +
  '`salesLedgerRows` (sales_ledger_daily, the third of `_stCloudEmailReport`\'s T1 email-report ' +
  'streams) now seeds from the OPFS cache at cold start and writes back to it on every live load, ' +
  'same pattern as pilot #1 (schedRows) and pilot #2 (qsrActSummaryRows). ' +
  'While adding it, found that `glimpseRows`/`cashRows` — already part of this cache since the ' +
  'Dexie v7 "QSRSoft email report types" migration, long before this egress plan existed — had ' +
  'TWO real gaps: (1) App.js\'s empty-shell restore branch (a user with no legacy manual-upload ' +
  'history at all) never seeded them from the cache, hardcoded to `[]`; (2) `_stCloudEmailReport`, ' +
  'the live T1 fetch stage, never wrote back to the cache at all — only the old manual-upload ' +
  'path did. Combined effect: any user who never manually uploads has had an effectively ' +
  'permanently-empty glimpse/cash cache this whole time. Both fixed alongside the new stream. ' +
  'OPFS blob version bumped 5→6 (additive-only — an older reader just gets `[]` for fields it ' +
  'doesn\'t recognize). `salesLedgerRows` needed no special date-field wrapper like pilot #2\'s ' +
  '`refreshedAt` did — confirmed by reading `loadSalesLedger`/`loadGlimpse`/`loadCash` that each ' +
  'emits exactly one Date field. 5 new tests ' +
  '(`dispatch-egress-phase1-salesledger-cache-2026-11-21.test.js`), including a ' +
  'confirmed-catches-a-regression check (broke the write-back line, watched the restore test fail ' +
  'with the exact wrong empty array, restored, re-verified). Full suite + build both clean.',
]};
