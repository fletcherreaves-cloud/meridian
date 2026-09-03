// @ts-nocheck
export default {version:'5.336', date:'2026-09-03', changes:[
  'Cleanup: removed 11 defined-but-never-called exports from src/lib/supabase.js -- ' +
  'saveDigitalAppMonthly, saveMcdeliveryMonthly, saveQsrOnHand, saveQsrVarianceStat, ' +
  'clearVarianceHistoryCache, saveQsrWaste, saveQsrTransfers, saveQsrRawItemDetail, ' +
  'saveOrgEventException, deleteOrgEventException, loadQsrKb. Each re-verified before removal: ' +
  'the 8 save-side functions are all orphaned duplicates -- every corresponding pull script ' +
  '(qsrsoft-onhand-pull.mjs, qsrsoft-variance-pull.mjs, qsrsoft-digital-app-pull.mjs, ' +
  'qsrsoft-mcdelivery-pull.mjs) already writes via its own raw supabase upsert, never through ' +
  'these wrappers. loadQsrKb was a redundant full-table dump superseded by the actually-used ' +
  'searchQsrKb (still live, still used by sage.js). org_event_exceptions never had a live write ' +
  'path at all -- its read side (loadOrgEventExceptions, used by forecast-week-precompute.mjs) ' +
  'is untouched. Corrected clearVarianceHistoryCache\'s own header comment, which claimed the ' +
  'cache was "cleared on any variance write" -- it never was (zero callers); it is TTL-only ' +
  '(5 min) in practice, since every variance write happens in a separate Node pull-script ' +
  'process, not through this in-browser client.',
  'Explicitly NOT removed: loadEomCountStatusHistory -- initially flagged as a same-pattern ' +
  'candidate, but eom-snapshot-pull.mjs actively writes real, accumulating data to ' +
  'eom_count_status_history and this was its only reader anywhere. Deleting it would have ' +
  'severed the only path to that data for a stated future capability (trend analysis, manager ' +
  'accountability, SAGE) -- restored after catching this before shipping.',
  'Full suite (3725 tests) and build both clean (533.30 KB / 850 KB eager budget). Smoke-tested ' +
  'via dev server + headless Chromium, zero JS errors (supabase.js is imported by most views).',
]};
