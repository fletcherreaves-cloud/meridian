// @ts-nocheck
export default {version:'5.482', date:'2026-09-24', changes:[
  'Scripts: added C2 -- idempotent, paced partition replace (scripts/_pipeline-contract.mjs), ' +
  'the backlog\'s "fully greenfield" C2 workstream item. plan-normalization-2026-08-17.md\'s own ' +
  'brief: "today\'s backfill pushed ~2.6M upserts and took Supabase into Cloudflare 522s, ' +
  'collapsing three sibling workflows and the SQL Editor. Standard is delete-then-insert per ' +
  'date partition, paced. Makes re-runs cheap and multi-year backfills routine."',
  'New replacePartition(rows, opts) does exactly that: delete the partition\'s existing rows, ' +
  'then insert the new set in chunks with an optional pacing delay between them -- delete-then-' +
  'insert (not upsert) so a re-run of the SAME partition actually replaces it (a row a since-' +
  'fixed source no longer sends disappears; every existing pull script is upsert-only and can ' +
  'only add/overwrite, never retract). del/insertChunk are injected async functions (same ' +
  'convention logPartitionCoverage/checkFreshness already use for log/warn/now), wrapped in the ' +
  'existing withRetry (_retry.mjs) so a transient mid-backfill blip retries instead of aborting ' +
  'the whole partition. Never calls process.exit() -- returns { ok, inserted, stage, error } and ' +
  'lets the caller decide, matching this module\'s own standing convention.',
  'The helper itself is the deliverable -- wiring it into a real pull script as proof is a ' +
  'separate, not-yet-done follow-on, same "helper first, adoption opportunistic" pattern C1\'s ' +
  'own ratchet already established. 9 new tests (dispatch-replace-partition-c2-2026-09-24.test.js) ' +
  'against the real exported replacePartition -- chunking, pacing (never a trailing delay after ' +
  'the last chunk), abort-before-insert on a delete failure, partial-insert reporting on a mid-' +
  'run failure, transient-error retry via withRetry -- all 9 confirmed to fail against the pre-' +
  'fix code (the function didn\'t exist). Full suite 543/543 files, 5112/5112 tests. Build clean, ' +
  'eager payload 552.37 KB gzip (budget 850 KB, unaffected -- scripts/ isn\'t client-bundled).',
]};
