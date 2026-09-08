// @ts-nocheck
export default {version:'5.403', date:'2026-09-08', changes:[
  'Fixed a real, live-observed bug: QSRSoft Employee Roster Pull was failing its ' +
  'qsr_employee_tenure write for the WHOLE 27-store batch whenever any single employee held ' +
  'more than one job code. The API returns one row per job code per person, so an employee ' +
  'with both a Primary and a Secondary code came back as two rows sharing the same (loc, geid) ' +
  '-- the table\'s actual upsert conflict key -- and Postgres\'s ON CONFLICT DO UPDATE throws ' +
  '"cannot affect row a second time" the instant a batch contains two rows with an identical ' +
  'conflict key, aborting the entire chunk atomically. Confirmed against a real gap this ' +
  'produced: store 43701 had zero qsr_employee_tenure rows at all, discovered while cross- ' +
  'referencing a register-audit/punch-time attribution sample against real job titles.',
  'toTenureRows() now dedupes by (loc, geid) before the upsert, preferring the row whose ' +
  'jobCodeType is \'Primary\' when a person has more than one code on file, keeping the ' +
  'first-seen row if neither is marked Primary rather than dropping the person entirely.',
  '4 new tests (employee-roster-tenure-pull.test.js, 15 total) proving the exact duplicate-key ' +
  'shape that broke production, the Primary-preference tiebreak, the no-Primary-flag fallback, ' +
  'and that a normal roster with no duplicates is unaffected. Full suite 487/4633, build clean.',
]};
