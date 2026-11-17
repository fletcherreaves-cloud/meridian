// @ts-nocheck
export default {version:'5.811', date:'2026-11-17', changes:[
  '**Register Audit added to the stream-freshness registry** — owner request: "every tile ' +
  'sourced from a paused stream should read its real age, not a silent —." Audited every ' +
  'table fed by the 32 paused QSRSoft credential-login pulls; Register Audit (audit_rows) — ' +
  'the owner\'s own #1-ranked manual upload — already had a real per-row coverage display in ' +
  'Data Manager, but no entry in stream-freshness.js\'s STREAMS registry, so it never reached ' +
  'At-A-Glance\'s home-screen freshness strip or the scheduled watchdog. Fixed. ~10 lower-' +
  'urgency paused-stream tables are still missing from STREAMS and documented as a follow-on, ' +
  'not auto-added without checking each one\'s real cadence first — see ' +
  'memory/finding-freshness-audit-paused-streams-2026-11-17.md.',
]};
