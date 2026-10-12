// @ts-nocheck
export default {version:'5.524', date:'2026-10-12', changes:[
  'Fixed a SECOND real bug in the brand-new lifelenz_punch_edits table (v5.522/v5.523), found ' +
  'when the owner tried to apply v5.523\'s own fix migration: LifeLenz\'s Modified Date/Time is ' +
  'only minute-granular, so (loc,geid,punch_type,modified_at) isn\'t actually unique -- a real ' +
  'employee had two distinct edits to the same punch type logged in the same minute (likely a ' +
  'multi-segment role/rate split), hit live as a 23505 duplicate-key error on the migration ' +
  'itself before any data was lost.',
  'Fix: added a seq column (0-based counter per (loc,geid,punch_type,modified_at) group, ' +
  'assigned by parsePunchEditCSV in CSV row order -- always an integer, never null, safe as a PK ' +
  'column regardless of which other fields are blank) and a new 5-column primary key. The schema ' +
  'migration now also backfills seq for rows already saved under the earlier key before ' +
  're-adding the constraint, so the owner\'s next migration attempt doesn\'t hit the same wall.',
  '3 new tests covering seq assignment: the exact real-world duplicate shape (same geid/' +
  'punch_type/modified_at, different adjusted_punch_at) gets distinct seq 0/1; a different group ' +
  'resets the counter rather than running a total across the whole CSV; the ordinary non-' +
  'colliding case (most real rows) stays seq 0.',
  'See memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md for the full "measured, not ' +
  'assumed" writeup of both bugs found today, including the honest caveat that seq\'s own ' +
  're-pull idempotency depends on an unverified assumption about LifeLenz\'s row ordering.',
]};
