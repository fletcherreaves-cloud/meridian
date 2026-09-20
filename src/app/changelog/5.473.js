// @ts-nocheck
export default {version:'5.473', date:'2026-09-20', changes:[
  'EOM Diagnosis: the "FOB components vs target" check (the FIRST check in the registry, order:10) ' +
  'has never fired for any store, ever. eom-diagnosis.js\'s fob-components check reads ' +
  'ctx.data.targets and only flags a component when a target key is present -- but ' +
  'eom-dashboard.js\'s buildDiagResult(), the ONLY thing that feeds runDiagnosis() in production ' +
  '(both the 🔬 Diagnose modal and the ✉️ Draft store-message flow), never included a targets key ' +
  'in its data object at all, so the lookup always failed silently. Dispatch #176 already fixed ' +
  'this check\'s key-name mapping to match FOB_COMPONENTS -- it just was never actually wired in.',
  'Fix reuses the exact tg-building pattern diagOptsFor() (same file) already uses for the report ' +
  'narrative text ({...DEFAULT_TARGETS[loc], ...monthlyOverrideFor(loc, period)}) -- one line added ' +
  'to buildDiagResult\'s data object, no new helper.',
  '1 new test opens the REAL 🔬 Diagnose modal via the actual button click path (not a direct ' +
  'eom-diagnosis.js unit test, which could pass by hand-supplying targets itself) and confirms a ' +
  'finding now renders for an over-target component -- confirmed to fail against the pre-fix code ' +
  '(report reads "No findings yet · 20 check(s) awaiting data"). Full suite 536/536 files, ' +
  '5066/5066 tests. Build clean, eager payload 551.62 KB gzip (budget 850 KB).',
]};
