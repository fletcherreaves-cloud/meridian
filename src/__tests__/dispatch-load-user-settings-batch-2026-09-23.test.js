// @ts-nocheck
// Backlog firing #5 (2026-09-23), §14: "dedupe duplicate startup requests
// (auth/org_config/user_settings)... never built beyond a simpler whole-table version." Verified
// live: App.js's T2 startup tier calls loadUserSetting() 5 times in the SAME instant
// (locked_projections/ae_params/model_assignments/dialed_in/recurring_rules), each paying its
// OWN supabase.auth.getUser() round trip + its own single-row select, even though all 5 run
// concurrently and want the same signed-in user.
//
// loadUserSettings(keys) (src/lib/supabase.js) batches this into ONE auth.getUser() + ONE
// `.in('key', keys)` select. Mocked-client technique matches
// email-digest-subscriptions-ui.test.js's own precedent (vi.stubEnv + a fake createClient),
// exercising the REAL exported function against a real fake Postgrest chain, not a
// reimplementation of its logic.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

let _mockUser = { id: 'user-1' };
let _mockRows = [];
let _mockErrorOnce = null;
let _authCalls = 0;
let _lastQuery = null;

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => { _authCalls++; return Promise.resolve({ data: { user: _mockUser } }); } },
    from: (table) => ({
      select: (cols) => ({
        eq: (col, val) => ({
          in: (col2, vals) => {
            _lastQuery = { table, cols, eqCol: col, eqVal: val, inCol: col2, inVals: vals };
            if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
            return Promise.resolve({ data: _mockRows, error: null });
          },
        }),
      }),
    }),
  }),
}));

const { loadUserSettings } = await import('../lib/supabase.js');

beforeEach(() => {
  _mockUser = { id: 'user-1' };
  _mockRows = [];
  _mockErrorOnce = null;
  _authCalls = 0;
  _lastQuery = null;
});

describe('loadUserSettings (batched)', () => {
  it('makes exactly ONE auth.getUser() call and ONE query, regardless of key count', async () => {
    _mockRows = [{ key: 'a', value: 1 }, { key: 'b', value: 2 }];
    await loadUserSettings(['a', 'b', 'c', 'd', 'e']);
    expect(_authCalls).toBe(1);
    expect(_lastQuery.table).toBe('user_settings');
    expect(_lastQuery.inCol).toBe('key');
    expect(_lastQuery.inVals).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(_lastQuery.eqCol).toBe('user_id');
    expect(_lastQuery.eqVal).toBe('user-1');
  });

  it('returns a { key: value } map built from the returned rows', async () => {
    _mockRows = [
      { key: 'locked_projections', value: { a: 1 } },
      { key: 'dialed_in', value: { data: {}, savedAt: 5 } },
    ];
    const r = await loadUserSettings(['locked_projections', 'dialed_in', 'recurring_rules']);
    expect(r.locked_projections).toEqual({ a: 1 });
    expect(r.dialed_in).toEqual({ data: {}, savedAt: 5 });
  });

  it('a requested key with no saved row is simply absent from the result', async () => {
    _mockRows = [{ key: 'a', value: 1 }];
    const r = await loadUserSettings(['a', 'b']);
    expect('a' in r).toBe(true);
    expect('b' in r).toBe(false);
    expect(r.b).toBeUndefined();
  });

  it('an empty key list returns {} without ever calling auth.getUser (no network round trip)', async () => {
    const r = await loadUserSettings([]);
    expect(r).toEqual({});
    expect(_authCalls).toBe(0);
  });

  it('no signed-in user resolves to {} rather than throwing', async () => {
    _mockUser = null;
    const r = await loadUserSettings(['a']);
    expect(r).toEqual({});
  });

  it('a query error fails soft to {} (never throws)', async () => {
    _mockErrorOnce = { message: 'boom' };
    const r = await loadUserSettings(['a']);
    expect(r).toEqual({});
  });
});

// Per "would this verification still pass if reverted?": the whole point of this dispatch is
// that App.js's 5 startup keys route through ONE loadUserSettings() call instead of 5 separate
// loadUserSetting() calls. App.js is too heavy a fixture chain to mount for this (same tradeoff
// sage-paginate.test.js/dispatch-swing-alarm-metric-context's own precedent makes for a call
// site that can't be feasibly click-tested) -- source-inspection on the real file instead.
// Reading via a cwd-relative path (not `new URL(..., import.meta.url)`) since this file has no
// happy-dom environment directive, so import.meta.url is a real file:// URL either way, but the
// cwd-relative form matches this repo's own established convention for this technique.
describe('App.js startup wiring (source-inspection)', () => {
  const src = readFileSync('src/app/App.js', 'utf8');

  it('routes the 5 T2 startup keys through ONE loadUserSettings(...) call', () => {
    const m = src.match(/loadUserSettings\(\s*\[([^\]]+)\]/);
    expect(m, 'loadUserSettings([...]) call not found in App.js').toBeTruthy();
    const keys = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    expect(keys).toEqual(['locked_projections', 'ae_params', 'model_assignments', 'dialed_in', 'recurring_rules']);
  });

  it('none of the 5 batched keys are still fetched via an individual loadUserSetting(...) call', () => {
    for (const key of ['locked_projections', 'ae_params', 'model_assignments', 'dialed_in', 'recurring_rules']) {
      expect(src, `loadUserSetting('${key}') should have been replaced by the batched read`)
        .not.toMatch(new RegExp(`loadUserSetting\\(\\s*['"]${key}['"]\\s*\\)`));
    }
  });

  it('loadUserSetting (singular) is still imported -- other callers (swing acks, etc.) are unaffected', () => {
    expect(src).toMatch(/\bloadUserSetting\b/);
  });
});
