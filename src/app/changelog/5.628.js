// @ts-nocheck
export default {version:'5.628', date:'2026-11-04', changes:[
  '**Fix: LifeLenz Payroll Readiness pull failed on its first live run — 0 rows saved across ' +
  '27/28 stores (task #85).** Root cause: a Postgres bulk upsert cannot apply ON CONFLICT DO ' +
  'UPDATE twice to the same (loc,geid,pay_period_start) key within one statement, and the ' +
  'parser had no dedup step — one colliding pair anywhere in a 500-row chunk killed the whole ' +
  'chunk, saving nothing. Fixed by falling back from a dead chunk to row-by-row upserts (same ' +
  'onConflict/last-write-wins semantics, just applied per row so one collision can no longer ' +
  'sink hundreds of good rows), with loud per-store collision-rate logging. **Also flagged, not ' +
  'resolved:** parsed row counts (1905-4313/store over ~4 pay periods) are far higher than "one ' +
  'row per employee per period" would predict — a real signal this report\'s true grain may be ' +
  'finer than this table\'s current primary key assumes. Full writeup: ' +
  'memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md. No schema change made ' +
  '(DDL stays the owner\'s own action) — re-run the pull and read the new collision-rate ' +
  'warnings before trusting this table\'s totals. 727/727 test files, 6648/6648 tests; build clean.',
]};
