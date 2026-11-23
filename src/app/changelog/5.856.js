// @ts-nocheck
export default {version:'5.856', date:'2026-11-23', changes:[
  '**Egress Wave 2 pilot #2: the three emailed-report streams (glimpse/cash/sales ledger) now ' +
  'watermark-sync too.** Task #190. `daily_glimpse_daily`/`cash_sheet_daily`/`sales_ledger_daily` ' +
  '(`scripts/qsrsoft-email-parse.mjs`) all set `updated_at` unconditionally on every upsert and ' +
  'share the same default `onConflict:\'loc,date\'` — confirmed upsert-only, same write-path ' +
  'discipline every prior pilot verified. `loadGlimpse`/`loadCash`/`loadSalesLedger` each gained ' +
  'a `since` option (via the existing `_pagedParallel` helper\'s `extraFilter`, no new pagination ' +
  'code) and now expose `updatedAt`. One shared `mergeEmailReportDelta` (not three near-identical ' +
  'copies — all three streams are structurally identical for everything the merge touches) keys ' +
  'on `loc+date`; `_stCloudEmailReport` now runs an independent watermark/early-return per stream ' +
  'since each syncs on its own schedule, skipping the whole stage only when every stream already ' +
  'has a watermark and found nothing new. 6 new tests ' +
  '(`dispatch-egress-wave2-pilot2-emailreports-watermark-2026-11-23.test.js`). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 26. Full suite + build both clean.',
]};
