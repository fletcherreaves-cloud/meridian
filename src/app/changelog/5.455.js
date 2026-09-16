// @ts-nocheck
export default {version:'5.455', date:'2026-09-16', changes:[
  'Stream-freshness coverage audit (Task #70): 8 auto/emailed streams that were already eager-' +
  'loaded into ds and consumed by live panels (eBOS Purchases, Forecast Week Cache, and 6 ' +
  'monthly Performance-Review streams -- Roster Statistics, Employee Roster, Turnover, Digital ' +
  'App, McDelivery, Shift Manager) had never been added to stream-freshness.js\'s STREAMS array, ' +
  'so a silent outage on any of them would go undetected the same way #171 originally hid ' +
  'LifeLenz and Sales Ledger behind fresher siblings.',
  'The 6 Performance-Review streams pull on a DAILY cron but their rows are keyed by a `month` ' +
  '(\'YYYY-MM\') field, not a daily date -- checking them with the same dateField:\'date\' + ' +
  'cadenceDays:1 every other stream uses would have false-alarmed every day after the month\'s ' +
  'first ~4 days, even on a perfectly healthy pull. Added a `dateField` override to STREAMS/' +
  '_latestDateOf (defaults to \'date\', overridable per-stream) and gave the 6 monthly streams ' +
  'dateField:\'month\' + cadenceDays:31 -- a genuinely monthly-grained threshold, not a loosened ' +
  'daily one.',
  'scripts/lib/scheduled-pull-registry.mjs (the GitHub-Actions-side watchdog registry, kept in ' +
  'lockstep with STREAMS by a bidirectional-guard test) gets the same 8 entries with real table/' +
  'column names verified directly against the loader functions in src/lib/supabase.js.',
  '13 new/updated tests in stream-freshness.test.js, including a regression case proving the ' +
  'exact failure mode this prevents (a month-keyed row has no `date` field at all -- without the ' +
  'override every one of these 6 streams would read Infinity-stale permanently on a fully ' +
  'healthy pull). Full suite 521/521 files, 4998/4998 tests. Build clean, eager payload 550.81 ' +
  'KB / 850 KB.',
]};
