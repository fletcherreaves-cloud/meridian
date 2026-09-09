// @ts-nocheck
export default {version:'5.410', date:'2026-09-09', changes:[
  'Security panel load-time fix, part 1 -- owner report the same day ("taking quite a while... ' +
  'several minutes"). Measured live, not assumed: security_findings has grown to 92,740 rows ' +
  '(the daily rolling-window batch writes a fresh row per subject+rule on every run, flagged or ' +
  'not) forcing ~93 sequential paginated requests every panel open (PostgREST here hard-caps a ' +
  'page at 1000 rows regardless of the Range header asked for, confirmed live) at a measured ' +
  '~1.4s/page -- that sequential cost, not a hang, is what produced "several minutes."',
  'loadSecurityFindings() now selects baseline_context->mean/->stdev/->n instead of select(\'*\'), ' +
  'dropping the ~26-42-element baseline_context.values float array from every row -- grepped ' +
  'both security-panel.js and security-drilldown.js first: that array is read NOWHERE in either ' +
  'file. Measured ~27% smaller payload per page on the live table. A real, immediate partial ' +
  'win -- the bigger fix (92,740 rows collapse to 3,669 distinct subject+rule combos, a 25x ' +
  'reduction) needs a server-side DISTINCT ON view plus a lazy per-subject history fetch so ' +
  'chronic/trend classification keeps working -- scoped, not shipped, see ' +
  'memory/finding-security-findings-load-time-2026-09-09.md and ' +
  'supabase/schema-security-findings-latest-view.sql for the exact follow-up.',
  '186/186 security-panel/security-rules-run/dispatch-139 tests pass unchanged (every one mocks ' +
  'loadSecurityFindings() directly, so the shape change is invisible to them), build clean, ' +
  '538.22 KB / 850 KB budget.',
]};
