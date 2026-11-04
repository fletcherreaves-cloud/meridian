// @ts-nocheck
export default {version:'5.616', date:'2026-11-04', changes:[
  '**"DATA INCOMPLETE" banner: fixed 45 loaders that would name the failing source as "a data ' +
  'table" instead of the real table (owner-reported, screenshot).** fetchAll()\'s own label ' +
  'argument exists to name the real source in that banner; a dispatch on 2026-11-02 fixed ONE ' +
  'call site this way and explicitly deferred "a broader sweep" of the rest ' +
  '(`memory/finding-missing-lifelenz-tables-2026-11-02.md`) -- this is that sweep, triggered by ' +
  'the same generic banner recurring. 45 loaders in `src/lib/supabase.js` (SMG VOICE, LifeLenz ' +
  'schedule/job-hours, DAR rows, roster/turnover/digital-app/McDelivery monthly rollups, FOB/' +
  'waste/transfer/inventory tables, EOM snapshots/review/share-links/integrity-flags/count-' +
  'status, equipment catalog/survey tables, coaching cycles, pay events, custom reports, and ' +
  'more) now pass their real table name — a future page failure on any of them names the actual ' +
  'source instead of the useless generic fallback. New regression-guard test ' +
  '(`src/__tests__/dispatch-fetchall-label-sweep-2026-11-04.test.js`) scans the real source for ' +
  'every `fetchAll()` call site and fails if a future one omits its label, verified to actually ' +
  'catch a reverted fix before being trusted. No behavior change beyond the banner text itself -- ' +
  'same data, same retry logic, just a nameable source when something fails. 713/713 test ' +
  'files, 6562/6562 tests; build clean.',
]};
