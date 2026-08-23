// @ts-nocheck
export default {version:'5.122', date:'2026-08-23', changes:[
  'Dispatch #80 -- SAGE reads the memory/ corpus, gated. The roadmap had claimed SAGE could '
  + 'already surface a named GM from memory; measured false -- sage-chat/index.ts reads exactly '
  + 'seven tables today and memory/ is not one of them. This change is what creates that '
  + 'exposure, so gating and ingestion ship together, never gating as a follow-up.\n\n'
  + '1) Classification: added a required sensitivity: open|restricted frontmatter field, gated '
  + "by the DOCUMENT's classification, not just the caller's role. Independently spot-checked "
  + "(not just trusted from a research agent) the corpus's 32-file first-pass slice -- 29 open, "
  + '3 restricted (a named-GM padding/cash investigation, and two QSRSoft endpoint captures with '
  + 'real cashier/manager names+badges from a security-event sample). profiles.role only ever '
  + "carries 3 real DB values (admin/supervisor/manager, not the 8-tier aspirational table) -- "
  + "restricted content is gated on role==='admin' only, the one value that can stand in for "
  + '"DO and above" while honoring the design\'s explicit "supervisor excluded" instruction. '
  + 'Documented as a considered call given the real constraint, not a guess.\n\n'
  + '2) sage_memory_kb table (schema-sage-memory-kb.sql): shaped like qsrsoft_kb, plus '
  + 'tenant_id+RLS like every other table (this one can carry personnel-adjacent narrative). '
  + '3) search_project_memory tool: filters SQL-side in the query -- a non-qualifying caller\'s '
  + "restricted rows are never fetched, not filtered out after the fetch -- deliberately "
  + "stricter than the existing accessible_locs precedent (which filters in JS after an "
  + 'unconditional fetch), and does NOT extend index.ts:695\'s existing prompt-only cross-store '
  + 'guard to personnel data, per the dispatch\'s explicit instruction. 4) scripts/'
  + 'sage-memory-ingest.mjs: hand-rolled frontmatter parser (no new dependency), chunks and '
  + 'upserts the curated finding-*/reference-*/analysis-*/design-* slice, fail-closed on missing '
  + 'frontmatter or an unrecognized sensitivity value. Run deliberately, never auto-synced on '
  + "commit -- shipping this PR is the review gate; the actual live ingest run is left for the "
  + 'owner, matching this repo\'s standing convention for schema/write scripts.\n\n'
  + 'CLAUDE.md and the 63 dispatch-*.md files are excluded by construction (no prefix match, '
  + 'never candidates) -- process instructions in SAGE\'s context would make it answer like a '
  + 'developer instead of an operator.\n\n'
  + 'Verification bar: a restricted document is not returned to a non-admin caller, and an '
  + 'unclassified document is not returned to anyone -- both asserted on search_project_memory\'s '
  + 'actual return value (buildMemorySearchResult()), not the prompt. New shared module '
  + 'supabase/functions/sage-chat/memory-kb.js is plain JS specifically so both index.ts and a '
  + 'Vitest test import the identical gating code; confirmed revert-sensitive by temporarily '
  + 'breaking the admin-only gate and watching 4/5 new tests fail. 2114/2114 tests passing, '
  + 'build clean, no client-bundle impact (server/Deno-side + a script + a schema file). Full '
  + 'writeup: memory/dispatch-80.md.',
]};
