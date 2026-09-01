// @ts-nocheck
// Owner req, verbatim (2026-09-01): "allow anyone to sign up or opt in to whichever reports they
// want emailed to them." loadMyEmailDigestSubscriptions()/setEmailDigestSubscription()
// (src/lib/supabase.js) are the UI-facing read/write pair EmailDigestSubscriptionsPanel calls.
// Mocked-client technique matches eom-digest-config.test.js / weekly-count-day-config.test.js's
// own precedent.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockUser = { id: 'user-1' };
let _mockRows = [];
let _mockErrorOnce = null;
let _lastCall = null; // { method: 'upsert'|'delete', ... }

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: _mockUser } }) },
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
          return Promise.resolve({ data: _mockRows, error: null });
        },
      }),
      upsert: (row, opts) => {
        _lastCall = { method: 'upsert', table, row, opts };
        if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
        return Promise.resolve({ data: row, error: null });
      },
      delete: () => ({
        eq: () => ({
          eq: (col2, val2) => {
            _lastCall = { method: 'delete', table, col2, val2 };
            if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
  }),
}));

const { loadMyEmailDigestSubscriptions, setEmailDigestSubscription } = await import('../lib/supabase.js');

beforeEach(() => { _mockUser = { id: 'user-1' }; _mockRows = []; _mockErrorOnce = null; _lastCall = null; });

describe('loadMyEmailDigestSubscriptions', () => {
  it('returns an empty Set when the user has no subscriptions', async () => {
    const s = await loadMyEmailDigestSubscriptions();
    expect(s).toEqual(new Set());
  });

  it('returns a Set of the real subscribed digest_keys', async () => {
    _mockRows = [{ digest_key: 'eom_digest' }, { digest_key: 'weekly_cycle_digest' }];
    const s = await loadMyEmailDigestSubscriptions();
    expect(s).toEqual(new Set(['eom_digest', 'weekly_cycle_digest']));
  });

  it('returns an empty Set when not signed in, rather than throwing', async () => {
    _mockUser = null;
    expect(await loadMyEmailDigestSubscriptions()).toEqual(new Set());
  });

  it('degrades to an empty Set on a query error', async () => {
    _mockErrorOnce = { message: 'boom' };
    expect(await loadMyEmailDigestSubscriptions()).toEqual(new Set());
  });
});

describe('setEmailDigestSubscription', () => {
  it('subscribing upserts a (user_id, digest_key) row', async () => {
    const res = await setEmailDigestSubscription('eom_digest', true);
    expect(res).toEqual({ saved: true });
    expect(_lastCall.method).toBe('upsert');
    expect(_lastCall.row).toEqual({ user_id: 'user-1', digest_key: 'eom_digest' });
    expect(_lastCall.opts).toEqual({ onConflict: 'user_id,digest_key' });
  });

  it('unsubscribing deletes the row instead of upserting', async () => {
    const res = await setEmailDigestSubscription('eom_digest', false);
    expect(res).toEqual({ saved: true });
    expect(_lastCall.method).toBe('delete');
  });

  it('fails cleanly when not signed in', async () => {
    _mockUser = null;
    const res = await setEmailDigestSubscription('eom_digest', true);
    expect(res).toEqual({ saved: false, error: 'Not signed in' });
  });

  it('surfaces a real write error', async () => {
    _mockErrorOnce = { message: 'permission denied' };
    const res = await setEmailDigestSubscription('eom_digest', true);
    expect(res).toEqual({ saved: false, error: 'permission denied' });
  });
});
