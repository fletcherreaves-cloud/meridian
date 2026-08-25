// @ts-nocheck
export default {version:'5.171', date:'2026-08-25', changes:[
  'Fix: Crew Schedule names were showing as "Employee #12345" for every row, district-wide — not '
  + 'a privacy/masking feature (dispatch #125 already removed the tokenization layer, and it '
  + 'still does), but a broken roster lookup. The LifeLenz Daily Sync job logs showed every '
  + '`GetSchedulableEmploymentsForPeriod` roster fetch failing outright with a GraphQL error '
  + '(`employmentsInScheduleTimeRange` doesn\'t accept an `includePayRates` argument), so '
  + '0/472 saved shift rows ever got a resolved name. This repo had already learned this exact '
  + 'lesson for the sibling `shifts()` query (its own comment: "includePayRates is NOT a shifts() '
  + 'argument"), but the same mistake was repeated for this different field — fixed by dropping '
  + 'the four unused include-flags from the roster query.\n\n'
  + 'Fix: a second bug in the same pull silently zeroed out most stores\' saved shift rows — '
  + '"ON CONFLICT DO UPDATE command cannot affect row a second time" (Postgres rejects an upsert '
  + 'batch that repeats its own conflict key). `scripts/lifelenz-pull.mjs`\'s '
  + 'upsertShiftAssignmentRows() now dedupes by (loc, shift_id) — the exact onConflict key — '
  + 'before upserting.\n\n'
  + 'Punch Times checked as part of the same report — already un-tokenized (dispatch #126) and '
  + 'already storing real employee_name for 81,846/132,350 rows (62%; the remainder have no '
  + 'matching qsr_employee_tenure record). No code change needed there; no UI panel reads this '
  + 'table yet, which is a separate, already-known gap.\n\n'
  + 'Full suite 2566/2566 passing; build clean; scripts-only change, no bundle impact.',
]};
