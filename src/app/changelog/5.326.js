// @ts-nocheck
export default {version:'5.326', date:'2026-09-02', changes:[
  'DAR pull: added mop_transactions (MOP/app guest count) -- backlog-master-2026-08-19.md ' +
  'flagged this as still open; field name taken verbatim from QSRSoft\'s own extracted ' +
  'columnFactory bundle (project-qsrsoft-dar-columns.md: "MOP GC = mop_transactions"), one ' +
  'hourly leg alongside dt_transactions/is_transactions, not guessed. Requires ' +
  'supabase/schema-qsr-dar-mop-transactions.sql (handed to the owner to run) before this PR ' +
  'lands on main -- scripts/qsrsoft-dar-pull.mjs upserts the whole row for both the hourly ' +
  'table and its rollup, so a missing column would fail that date\'s entire save on the very ' +
  'next scheduled run, not just this one field. Confirmed missing live (service-role read): ' +
  'a select for mop_transactions on qsr_daily_activity returned 42703 before this.',
  'Pull only, same "ship the data, build the view later" sequencing as today\'s other pulls -- ' +
  'wiring MOP guest count into metric-source.js or a panel is a follow-on. Full suite (3718 ' +
  'tests) and build both clean.',
]};
