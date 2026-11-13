// @ts-nocheck
export default {version:'5.757', date:'2026-11-13', changes:[
  '**Multi-org readiness (task #70): org_config tenant-PK fix written, awaiting the owner\'s ' +
  'SQL-editor run.** `org_config`\'s primary key was just `key`, not `(key, tenant_id)` — a ' +
  'documented gap that would collide a second tenant\'s row with the owner\'s on the same key. ' +
  'Re-scoped while writing this: a PK-only change would NOT have actually fixed it — ' +
  '`org_config`\'s `tenant_id` column defaults to the owner\'s hardcoded UUID with no tenant- ' +
  'stamping trigger attached, so even post-PK-change, every insert from any tenant would still ' +
  'land tagged as the owner\'s tenant and collide anyway. `supabase/schema-fix-org-config-' +
  'tenant-pk-2026-11-13.sql` also drops that default and attaches the standard ' +
  '`set_tenant_id_trg` (same pattern ~70 other tables already use) — confirmed safe since every ' +
  'real org_config writer in the codebase is an authenticated session, never service-role. All ' +
  '5 app-side `onConflict:\'key\'` upsert call sites updated to `\'key,tenant_id\'` ' +
  '(`src/lib/supabase.js` ×4, `src/views/eom-supervisor.js` ×1) so they won\'t error against the ' +
  'new constraint once it\'s live; the other 2 org_config upserts pass no explicit `onConflict` ' +
  'and retarget automatically. This session has no DDL execution path — the SQL is written, not ' +
  'run; same precedent as task #76\'s migration. 4 new tests, full suite (7964 tests) and build ' +
  'pass clean (700.66 KB eager, budget 850 KB).',
]};
