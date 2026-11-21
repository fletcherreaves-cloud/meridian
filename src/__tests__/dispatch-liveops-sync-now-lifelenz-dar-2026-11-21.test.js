// @ts-nocheck
// Owner request (2026-11-21): Signals Live Ops's "⟳ Sync Now" button (signals.js's handleSync)
// was dispatching the 'dar' workflow (qsrsoft-dar-pull.yml) via triggerDarSync. That workflow
// has been schedule-paused since 2026-11-16 for compliance reasons (CLAUDE.md's QSRSoft
// Operator Security Notice) — clicking the button dispatched a pull that would never run.
// loadDailyActivity's own read path already falls back to LifeLenz's DAR when QSRSoft's is
// empty (task #187, dispatch-liveops-lifelenz-dar-fallback-2026-11-21.test.js), so the manual
// button is fixed here to dispatch that SAME stand-in source ('lifelenz_dar', backed by
// lifelenz-dar-pull.yml) instead of the dead one.
//
// Tests the REAL triggerDarSync/triggerSync functions (not a mocked stand-in) against a mocked
// supabase-js client + global fetch, so this verifies the actual request body sent to the
// trigger-dar-sync Edge Function — same principle as this repo's other loader-scope tests
// (verify the function's own computed output, not a black-box mock of it).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'fake-token' } } }),
    },
  }),
}));

let loaders;
let fetchMock;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ status: 'dispatched', workflow: 'lifelenz_dar', message: 'LifeLenz DAR sync started' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  loaders = await import('../lib/supabase.js');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('triggerDarSync (Signals Live Ops "⟳ Sync Now") dispatches lifelenz_dar, not the paused dar workflow', () => {
  it('default call (daysRecent=1) dispatches workflow "lifelenz_dar" with a 24h lookback, never "dar"', async () => {
    await loaders.triggerDarSync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/trigger-dar-sync');
    const body = JSON.parse(opts.body);
    expect(body.workflow).toBe('lifelenz_dar');
    expect(body.workflow).not.toBe('dar');
    expect(body.inputs).toEqual({ lookback_hours: '24' });
  });

  it('a larger daysRecent scales lookback_hours proportionally (days * 24)', async () => {
    await loaders.triggerDarSync({ daysRecent: 3 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.inputs.lookback_hours).toBe('72');
  });

  it('never sends less than a 24h lookback even for a sub-day daysRecent', async () => {
    await loaders.triggerDarSync({ daysRecent: 0.1 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.inputs.lookback_hours).toBe('24');
  });
});
