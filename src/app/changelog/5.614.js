// @ts-nocheck
export default {version:'5.614', date:'2026-11-04', changes:[
  '**SAGE memory: product-vs-tenant knowledge scope split (owner-approved, task #70).** Applied ' +
  'the mechanism from memory/plan-knowledge-backbone-2026-11-03.md §3 — `sage_memory_kb` gets a ' +
  'new `scope` column (`\'product\'` = generic, reusable knowledge, safe for every future ' +
  'tenant; `\'tenant\'` = this operator\'s own proprietary knowledge, the default, visible only ' +
  'within its own tenant). `scripts/sage-memory-ingest.mjs` reads an optional `scope:` ' +
  'frontmatter tag, defaulting every already-ingested file to `\'tenant\'` (nothing in the ' +
  'existing corpus is reclassified or skipped). `search_project_memory` (sage-chat/index.ts) now ' +
  'returns a row when it\'s either the caller\'s own tenant or explicitly `scope=\'product\'`. ' +
  '**Needs one manual step before the next `sage-chat` deploy**: run ' +
  '`supabase/schema-sage-memory-kb-scope.sql` in the Supabase SQL editor first (DDL is always ' +
  'the owner\'s own action) — the updated query references the column unconditionally, so ' +
  'deploying before the migration runs would break memory search until it does. No file in the ' +
  'existing corpus carries `scope: product` yet — nothing is actually shared across tenants ' +
  'today; that classification pass is still deliberately deferred (see the plan doc §4).',
]};
