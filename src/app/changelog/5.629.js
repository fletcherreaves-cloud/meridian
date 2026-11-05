// @ts-nocheck
export default {version:'5.629', date:'2026-11-05', changes:[
  '**Fix (v2): LifeLenz Payroll Readiness pull\'s first fix was itself wrong — found by ' +
  'watching the re-triggered run live, not assumed fixed.** The row-by-row fallback shipped ' +
  'as v1 hit the EXACT same collision on every single 500-row chunk, for every store — a ' +
  'systematic, not occasional, problem — and was slow enough (~50s/chunk) that the job\'s own ' +
  '20-minute timeout killed the run after only 6 of 28 stores. Worse, its "loud collision ' +
  'logging" could never actually fire: a single-row upsert always succeeds even while silently ' +
  'overwriting a same-batch sibling under the same key, so the collision counter was dead code. ' +
  'Real fix: de-duplicate in memory by (geid,pay_period_start) before upserting, keeping the ' +
  'last row per key — same last-write-wins semantics, full bulk-upsert speed restored, and the ' +
  'collision count is now computed from real key comparisons, so it can actually report what\'s ' +
  'happening. Stronger evidence than before (100% per-chunk collision rate measured across every ' +
  'store, not just a row-count inference) that this table\'s primary key likely isn\'t this ' +
  'report\'s true unique key — still flagged for the owner, no DDL made. Full writeup: ' +
  'memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md. 727/727 test files, ' +
  '6648/6648 tests; build clean.',
]};
