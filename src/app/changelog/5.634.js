// @ts-nocheck
export default {version:'5.634', date:'2026-11-05', changes:[
  '**Fix: At-A-Glance\'s "Loaded Data" strip was stale and could hide a dead stream (owner-' +
  'flagged).** It hand-unioned 5 hardcoded `ds` arrays into 5 fixed buckets — missing ~15 of ' +
  'the now ~24 real automated streams entirely (every LifeLenz Attendance/Compliance Audit/' +
  'Employee Performance/Roster/Turnover stream added since this strip was first built), and ' +
  'letting a fresh sibling stream mask a dead one within the same bucket — the exact #171 ' +
  'pooling bug stream-freshness.js\'s own per-stream check already exists to prevent, ' +
  'reintroduced one layer up. **Fix:** added a `group` tag to every `STREAMS` entry (the one ' +
  'canonical registry Data Manager\'s table and the Action Checklist\'s staleness banner ' +
  'already read) and a new `groupFreshness()` that rolls them up by category — Sales, ' +
  'Scheduling, Service, Controls, FOB, and a new **People** group for the LifeLenz HR-adjacent ' +
  'streams that never fit the other five. A group\'s badge now shows the WORST severity among ' +
  'its real members (never masked by a fresh one) with amber/red coloring + a ⚠, falls back to ' +
  'a plain "no rows synced yet" instead of a confusing "? – ?" when a stream is loaded but ' +
  'empty, and a new ⓘ next to the strip\'s label opens Data Manager for the full per-stream ' +
  'table. Live-verified in the browser against real Supabase data (not just unit tests) — ' +
  'Scheduling/People groups render correctly green, Service/Controls correctly flag "no rows ' +
  'synced yet" with a warning. New tests: dispatch-94-loaded-data-groupfreshness-2026-11-05 (6 ' +
  'tests). Lowered the raw-metric-row ratchet ceiling 142→139 (3 ad hoc `ds.*Rows` reads in ' +
  'this strip now route through the shared engine instead). 732/732 test files, 6668/6668 ' +
  'tests; build clean.',
]};
