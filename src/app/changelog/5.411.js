// @ts-nocheck
export default {version:'5.411', date:'2026-09-09', changes:[
  'Security panel load-time fix, part 2. 92,740 security_findings rows measured v5.410 collapse ' +
  'to 19,723 distinct (loc, subject, rule) combos, a ~4.7x row-count reduction PostgREST can\'t ' +
  'express client-side. supabase/schema-security-findings-latest-view.sql adds a DISTINCT ON ' +
  'view (security_invoker=true -- re-runs the base table\'s own RLS as the caller, no policy ' +
  'duplication) that collapses ~93 pages down to ~20. Owner applied it the same evening. (A first ' +
  'same-day measurement said 3,669/25x -- that dedup key omitted loc, wrongly merging one item\'s ' +
  'findings across all 27 stores; corrected once measured against the live view.)',
  '⚠️ Row count is not the same as speed, measured the SAME evening after the owner applied the ' +
  'view: a full timed fetch through it took 59,975ms vs 66,085ms through the base table directly ' +
  '-- only ~1.1x faster, not the ~4.7x the row-count reduction implied. No index supports the ' +
  'view\'s DISTINCT ON, so Postgres re-Sorts the whole base table on every paginated request. ' +
  'supabase/schema-security-findings-latest-index.sql is the actual remaining fix -- written, ' +
  'not yet applied or measured. See memory/finding-security-findings-load-time-2026-09-09.md.',
  'That probe needed a real fix mid-build, caught only by testing the actual @supabase/supabase-js ' +
  'client against live production before shipping: a `{head:true}` select against a relation ' +
  'that does not exist came back status 204/success:true on this project -- a false positive ' +
  'that would have sent every real request into a guaranteed failure the moment this shipped. ' +
  'Fixed with a real data-returning probe and PostgREST\'s actual missing-relation code ' +
  '(PGRST205, not the raw Postgres 42P01 first assumed).',
  'Chronic/trend classification is preserved, not traded away, for the row-count win: the view ' +
  'only ever holds latest-per-subject-per-rule, which the closed list already reduced to anyway, ' +
  'but classifySubjectTrend/classifySubjectShape/buildSubjectTimeline need real multi-window ' +
  'history. New loadSecurityFindingsForSubject() (mirrors the existing ' +
  'loadQsrSecurityEventsForSubject pattern) fetches one subject\'s full history from the base ' +
  'table lazily on row-expand, cached so it fires at most once per subject per session. ' +
  'buildHistoryByRule() factored out of groupFindingsBySubject() so both paths build the ' +
  'identical shape.',
  '6 new tests (buildHistoryByRule unit tests + 3 component tests proving the lazy fetch actually ' +
  'rewires rendered trend labels, not just that the mock got called) -- full suite 4664/4664, ' +
  'build clean, 538.58 KB / 850 KB budget. New query shapes re-verified live against production ' +
  'via the real supabase-js client, not just raw REST.',
]};
