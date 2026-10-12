// @ts-nocheck
export default {version:'5.525', date:'2026-10-12', changes:[
  'Fixed a THIRD real bug in lifelenz_punch_edits (v5.522-v5.524): the re-verification sync ' +
  'after the seq fix hit the EXACT SAME "null value in column adjusted_punch_at ... violates ' +
  'not-null constraint" error on the exact same 7 stores, 184/319 saved. Root cause, measured ' +
  'against real Postgres behavior: dropping a PRIMARY KEY constraint does NOT revert the ' +
  'column-level NOT NULL Postgres sets as a side effect of a column being part of that key -- ' +
  'that flag is independent and stays until explicitly dropped, which the first fix (DROP ' +
  'CONSTRAINT lifelenz_punch_edits_pkey) never did.',
  'Fix: added an explicit alter table ... alter column adjusted_punch_at drop not null as its ' +
  'own migration step. See memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md for the ' +
  'full three-bug story -- a genuine example of this repo\'s own "measure it, don\'t reason ' +
  'about it" rule: each fix was validated against a real live run, not assumed correct.',
]};
