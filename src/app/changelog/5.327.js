// @ts-nocheck
export default {version:'5.327', date:'2026-09-02', changes:[
  'Revert: mop_transactions (v5.326, MOP/app guest count) removed from the DAR pull ' +
  '(scripts/qsrsoft-dar-pull.mjs) after live verification found it dead. A diagnostic dump of ' +
  'the real daily-activity-raw API row (store 3708, 2026-09-01, 07:00) showed 106 real keys and ' +
  'zero mop-shaped keys -- the field genuinely does not exist on this endpoint. Cross-checked ' +
  'against sales_ledger_daily.mop_gc (a different report, daily grain), which shows real MOP ' +
  'volume for the same store/date (178 guests) while the new DAR field sat at 0 across every ' +
  'hour, every store, the whole time it was live.',
  'qsrsoft-kb-digest.md explains why: MOP orders fold into is_transactions/front-counter on this ' +
  'particular report, not their own leg. Daily-grain MOP GC is already covered by ' +
  'sales_ledger_daily.mop_gc -- no gap there. An hourly MOP leg is still a real, open gap, but ' +
  'needs a different (unconfirmed) QSRSoft endpoint, not a SELECT_COLS addition to this script. ' +
  'The now-unused mop_transactions column on qsr_daily_activity/qsr_daily_activity_rollup is ' +
  'left in place (harmless, always-0 default, nothing else reads it) rather than dropped, since ' +
  'this session has no DDL access.',
  'Full writeup in memory/project-qsrsoft-dar-columns.md and backlog-master-2026-08-19.md. Full ' +
  'suite (3718 tests) and build both clean.',
]};
