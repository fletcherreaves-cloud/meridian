// @ts-nocheck
export default {version:'5.522', date:'2026-10-12', changes:[
  'New LifeLenz punch-edit audit pull -- unblocks the manual-time-edit-pattern security rules ' +
  '(plan-security-loss-prevention.md) that were sitting blocked on "no vendor exposes editor ' +
  'identity + edit timestamp + the original value." They do: LifeLenz\'s own admin report ' +
  '`time_punch_change_approvals_report` (owner-captured 2026-10-12) carries exactly those three ' +
  'fields -- Manager Modified, Modified Date/Time, and the original-vs-adjusted punch value.',
  'scripts/lifelenz-pull.mjs gained a 6th pull step (pullPunchEditAudit, escape hatch ' +
  'LIFELENZ_SKIP_PUNCH_AUDIT=1) reusing the SAME per-store scheduleIds the existing sync already ' +
  'discovers and the SAME report-polling machinery (pollForReport) the main CSV pull already ' +
  'uses -- no new discovery step, no new auth path. New table lifelenz_punch_edits ' +
  '(supabase/schema-lifelenz-punch-edits.sql), same tenant+accessible_locs RLS pattern as ' +
  'lifelenz_shift_assignments, names stored directly (dispatch #125\'s existing scheduling/' +
  'punch-time directive -- no SSN/DOB/address field exists in this report).',
  'Only rows where the report\'s own Adjustment Type is non-blank (Add or Edit) are stored -- an ' +
  'ordinary punch with no adjustment is already covered by QSRSoft\'s qsr_punch_times and is not ' +
  'duplicated here. This is a punch-EDIT table, not a general punch log.',
  '15 new tests (parsePunchEditCSV/parsePunchDateTime, 100% synthetic fixtures -- no real names/' +
  'GEIDs/manager names) covering the report\'s sparse per-employee-block CSV shape (Employee ' +
  'Name/GEID/Payroll ID carry forward across blank rows), the Add-vs-Edit distinction, and ' +
  'null-vs-empty-string field hygiene.',
  'NOT yet run against the live LifeLenz API -- no agent session in this build had LifeLenz ' +
  'credentials. First real test is the next scheduled GitHub Action run (already watched via ' +
  'sync-failure-watch.yml, same workflow name, no new entry needed) -- check its `[punch-audit]` ' +
  'log line rather than assuming success from a clean exit code. Still not built: a \'labor\' ' +
  'domain in security-panel.js (assembleLaborDrilldown()) to actually surface this data -- the ' +
  'pull lands it in Supabase, nothing reads it yet. See ' +
  'memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md for the full writeup.',
]};
