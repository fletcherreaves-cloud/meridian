// @ts-nocheck
// Backlog firing #6 (2026-09-24), §14: firing #5 batched the `user_settings` half of "dedupe
// duplicate startup requests (auth/org_config/user_settings)" and left "the auth/org_config
// duplication this line also named" explicitly still open. Verified live: App.js's startup
// fires 4 separate org_config reads in the same instant (app_settings/store_registry/
// contact_registry/app_user_targets), each its own `.eq('key',X).maybeSingle()` round trip.
//
// loadOrgConfigs(keys) (src/lib/supabase.js) batches this into ONE `.in('key', keys)` select --
// even simpler than loadUserSettings, since org_config is app-wide (no user_id column, no
// auth.getUser() call at all). Mocked-client technique matches
// dispatch-load-user-settings-batch-2026-09-23.test.js's own precedent (itself matching
// email-digest-subscriptions-ui.test.js), exercising the REAL exported function against a real
// fake Postgrest chain, not a reimplementation of its logic.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

let _mockRows = [];
let _mockErrorOnce = null;
let _lastQuery = null;
let _fromCalls = 0;

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
    from: (table) => {
      _fromCalls++;
      return {
        select: (cols) => ({
          in: (col, vals) => {
            _lastQuery = { table, cols, inCol: col, inVals: vals };
            if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
            return Promise.resolve({ data: _mockRows, error: null });
          },
        }),
      };
    },
  }),
}));

const { loadOrgConfigs } = await import('../lib/supabase.js');

beforeEach(() => {
  _mockRows = [];
  _mockErrorOnce = null;
  _lastQuery = null;
  _fromCalls = 0;
});

describe('loadOrgConfigs (batched)', () => {
  it('makes exactly ONE query against org_config, regardless of key count', async () => {
    _mockRows = [{ key: 'app_settings', data: { theme: 'command' } }];
    await loadOrgConfigs(['app_settings', 'store_registry', 'contact_registry', 'app_user_targets']);
    expect(_fromCalls).toBe(1);
    expect(_lastQuery.table).toBe('org_config');
    expect(_lastQuery.inCol).toBe('key');
    expect(_lastQuery.inVals).toEqual(['app_settings', 'store_registry', 'contact_registry', 'app_user_targets']);
  });

  it('returns a { key: data } map built from the returned rows', async () => {
    _mockRows = [
      { key: 'app_settings', data: { theme: 'golden' } },
      { key: 'app_user_targets', data: { tSales: 5000 } },
    ];
    const r = await loadOrgConfigs(['app_settings', 'app_user_targets', 'store_registry']);
    expect(r.app_settings).toEqual({ theme: 'golden' });
    expect(r.app_user_targets).toEqual({ tSales: 5000 });
  });

  it('a requested key with no saved row is simply absent from the result', async () => {
    _mockRows = [{ key: 'app_settings', data: { theme: 'command' } }];
    const r = await loadOrgConfigs(['app_settings', 'store_registry']);
    expect('app_settings' in r).toBe(true);
    expect('store_registry' in r).toBe(false);
    expect(r.store_registry).toBeUndefined();
  });

  it('an empty key list returns {} without ever querying org_config', async () => {
    const r = await loadOrgConfigs([]);
    expect(r).toEqual({});
    expect(_fromCalls).toBe(0);
  });

  it('a query error fails soft to {} (never throws)', async () => {
    _mockErrorOnce = { message: 'boom' };
    const r = await loadOrgConfigs(['app_settings']);
    expect(r).toEqual({});
  });
});

// Per "would this verification still pass if reverted?": the whole point of this dispatch is
// that App.js's 4 startup org_config keys route through ONE loadOrgConfigs() call instead of 4
// separate `supabase.from('org_config')...` calls. App.js is too heavy a fixture chain to mount
// for this (same tradeoff dispatch-load-user-settings-batch-2026-09-23.test.js's own precedent
// makes) -- source-inspection on the real file instead.
describe('App.js startup wiring (source-inspection)', () => {
  const src = readFileSync('src/app/App.js', 'utf8');

  it('routes the 4 startup org_config keys through ONE loadOrgConfigs(...) call', () => {
    const m = src.match(/loadOrgConfigs\(\s*\[([^\]]+)\]/);
    expect(m, 'loadOrgConfigs([...]) call not found in App.js').toBeTruthy();
    const keys = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    expect(keys).toEqual(['app_settings', 'store_registry', 'contact_registry', 'app_user_targets']);
  });

  it('none of the 4 batched keys are still fetched via an individual org_config select', () => {
    for (const key of ['app_settings', 'store_registry', 'contact_registry', 'app_user_targets']) {
      expect(src, `org_config key '${key}' should have been replaced by the batched read`)
        .not.toMatch(new RegExp(`org_config'\\)\\.select\\('data'\\)\\.eq\\('key','${key}'\\)`));
    }
  });

  it('other org_config readers (loadEomDigestConfig, gm_identity_reveal_enabled) are unaffected', () => {
    const supabaseSrc = readFileSync('src/lib/supabase.js', 'utf8');
    expect(supabaseSrc).toMatch(/loadEomDigestConfig/);
    expect(supabaseSrc).toMatch(/gm_identity_reveal_enabled/);
  });
});
