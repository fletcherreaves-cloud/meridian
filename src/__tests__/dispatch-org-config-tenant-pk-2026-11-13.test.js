// @ts-nocheck
// Task #70 (multi-org readiness) — org_config's primary key is being changed from `key` alone
// to `(key, tenant_id)` (supabase/schema-fix-org-config-tenant-pk-2026-11-13.sql, written here,
// awaiting the owner's own SQL-editor run — this session has no DDL execution path, same
// precedent as task #76's migration). A PK-only fix would NOT actually solve the collision it's
// meant to fix (see that SQL file's own header for the full reasoning: without also dropping the
// hardcoded tenant_id column default and attaching the standard set_tenant_id_trg trigger, every
// org_config insert — from any tenant — still lands tagged as the owner's tenant, so the
// composite key never comes into play). This file covers the APP-SIDE half of the fix: every
// org_config upsert that explicitly named `onConflict: 'key'` must now say `'key,tenant_id'`, or
// it will error against the new constraint the moment the migration runs. (The other two
// org_config upserts in the codebase, review-engine.js's pushConfigToSupabase/
// pushTemplatesToSupabase, pass no onConflict at all — supabase-js defaults to the table's real
// PK automatically, so those need no code change; not re-tested here, nothing to assert.)
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _lastUpsert = null; // { table, row, opts }

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      upsert: (row, opts) => { _lastUpsert = { table, row, opts }; return Promise.resolve({ data: row, error: null }); },
    }),
  }),
}));

const { saveOrgConfig, saveSpotCheckRulerConfig, saveCustomLocationGroups } = await import('../lib/supabase.js');

beforeEach(() => { _lastUpsert = null; });

describe('org_config upserts target the composite (key, tenant_id) conflict key', () => {
  it('saveOrgConfig', async () => {
    await saveOrgConfig('app_settings', { foo: 1 });
    expect(_lastUpsert.table).toBe('org_config');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'key,tenant_id' });
  });

  it('saveSpotCheckRulerConfig', async () => {
    await saveSpotCheckRulerConfig({ enabled: true, dowUtc: 1, hourUtc: 12, topN: 3 });
    expect(_lastUpsert.table).toBe('org_config');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'key,tenant_id' });
  });

  it('saveCustomLocationGroups', async () => {
    await saveCustomLocationGroups([{ id: 'g1', name: 'Test Group', locs: ['10422'] }]);
    expect(_lastUpsert.table).toBe('org_config');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'key,tenant_id' });
  });
});
