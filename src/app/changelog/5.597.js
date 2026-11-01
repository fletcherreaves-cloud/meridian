// @ts-nocheck
export default {version:'5.597', date:'2026-11-01', changes:[
  '**New: Schedule Discipline (Labor & Scheduling hub).** First build against LifeLenz\'s new ' +
  '"Data Explorer" (a separate, Lakehouse-backed report system shipped alongside LifeLenz\'s ' +
  'own 2026-10-29 redesign, distinct from the legacy Download Reports page our daily sync ' +
  'already reads). Pulls the Schedule Variance report daily -- every edit made to a published ' +
  'schedule, who made it, what changed, and the resulting hours/cost impact -- into a new ' +
  'tab showing per-store and per-editor rollups plus a recent-edits drill-down. A store that ' +
  'keeps editing its schedule after publish, especially adding cost, is a real planning-' +
  'discipline signal this app did not previously see.',
  'Also feeds Signals\' metric registry (Schedule Edits, Schedule Edit Cost Impact) so it can ' +
  'auto-correlate against every other metric the Scanner already covers.',
  'New automated pull: scripts/lifelenz-schedule-variance-pull.mjs (daily, LifeLenz Schedule ' +
  'Variance Pull workflow) — watched by sync-failure-watch.yml and stream-freshness.js like ' +
  'every other daily stream.',
  'The other 4 new Data Explorer tiles (Compliance Audit, Employee Performance, Payroll ' +
  'Readiness, Time Punch Activity Log) are not built yet -- this pull also runs a read-only ' +
  'discovery pass logging their real column schema for a follow-up build, rather than guessing ' +
  'at field names. See memory/lifelenz-session.md.',
]};
