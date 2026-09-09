// @ts-nocheck
export default {version:'5.412', date:'2026-09-09', changes:[
  'Security panel load-time fix, part 3 -- closed out and verified. supabase/schema-security-' +
  'findings-latest-index.sql (a covering index matching security_findings_latest\'s DISTINCT ON ' +
  '+ ORDER BY) applied by the owner after v5.411\'s view alone measured only ~1.1x faster than ' +
  'the unfixed base table. Re-timed the identical fetch after: 9,708ms for the same 20-page ' +
  'fetch that used to take 66,085ms unfixed -- ~6.8x faster overall (6.2x from the index alone). ' +
  'First page still costs ~2.7s (planning/cold cache); every page after ran 270-500ms.',
  'Docs-only change (no app code) -- corrected the same claims in src/lib/supabase.js\'s own ' +
  'comment, both SQL migration file headers, and memory/finding-security-findings-load-time-' +
  '2026-09-09.md to state the verified numbers instead of the pre-index estimate. That file now ' +
  'records both same-day corrections in full (the initial 3,669/25x row-count error, then the ' +
  '~1.1x speed surprise) rather than scrubbing them once the final numbers looked good.',
]};
