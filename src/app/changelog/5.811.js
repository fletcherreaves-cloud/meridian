// @ts-nocheck
export default {version:'5.811', date:'2026-11-17', changes:[
  '**Freshness audit of every paused-QSRSoft-stream tile — no code change, corrected same ' +
  'day.** Owner request: "every tile sourced from a paused stream should read its real age, ' +
  'not a silent —." Audited every table fed by the 32 paused QSRSoft credential-login pulls. ' +
  'First pass flagged Register Audit (audit_rows) as missing from the stream-freshness.js ' +
  'STREAMS registry and added an entry for it; the full test suite caught that this was wrong ' +
  '— STREAMS requires a matching scheduled-pull-registry.mjs entry naming a real automated-' +
  'pull workflow, and Register Audit is a manual upload with no workflow to name. Reverted. ' +
  'Register Audit already has a correct, real per-row freshness display in Data Manager\'s own ' +
  'coverage table — no gap to close there. See ' +
  'memory/finding-freshness-audit-paused-streams-2026-11-17.md for the full corrected writeup ' +
  'and the ~10 other paused-stream tables still missing from STREAMS (none auto-fixed, each ' +
  'needs its own cadence/visibility check first).',
]};
