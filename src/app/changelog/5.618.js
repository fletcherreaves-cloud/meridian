// @ts-nocheck
export default {version:'5.618', date:'2026-11-04', changes:[
  '**Unified Targets: filled in "no data" gaps for DT Park %, KVS Time, R2P, T-Red Before/' +
  'After %, and Discount % (owner-reported, screenshot).** These metrics\' Current (L4W) column ' +
  'showed "— no data" even though a Smart Target existed for each, built from the same ' +
  'underlying history. Root cause, measured against the real loaders: R2P/T-Red/Discount had NO ' +
  'cloud fallback at all in engine/tolerance-status.js\'s TOL_SPEC (manual Ops/Controls Report ' +
  'uploads only), and Park/KVS had only one (the emailed Daily Glimpse stream, not always fresh ' +
  'for a trailing 4-week window) -- while real, already-computed auto-pulled sources sat unused: ' +
  'ds.qsrActSummaryRows.r2p (reconciled exactly against QSRSoft\'s own R2P column), ' +
  'ds.opsCashRows.{tRedBPct,tRedAPct,discPct,cashOSPct} (net-sales-weighted, from qsr_cash_sheet), ' +
  'ds.opsServiceRows.{park,kvst} (from qsr_service_stats). tolValuesForLoc now tries a second ' +
  'cloud tier (cloud2) when the first has no coverage, same shape its existing man/man2 fallback ' +
  'already uses. Manual uploads and the first cloud tier still win exactly as before -- purely ' +
  'additive. 9 new tests (src/__tests__/dispatch-unified-targets-cloud-fallback-2026-11-04.test.js). ' +
  '715/715 test files, 6581/6581 tests; build clean.',
]};
