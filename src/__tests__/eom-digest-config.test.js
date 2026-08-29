// @ts-nocheck
// Dispatch #217 — EOM digest settings: configurable levels + send hour.
//
// loadEomDigestConfig()/saveEomDigestConfig() (src/lib/supabase.js) read/write org_config's
// NEW 'eom_digest_config' key — same shape as the existing loadUserSetting/saveUserSetting
// pair just above them in that file, but org-wide (org_config) rather than per-user
// (user_settings). Mocked-client technique matches yearly-targets-persistence.test.js /
// target-overrides.test.js (this repo's existing precedent for exercising the real
// src/lib/supabase.js functions against a fake supabase-js client, not a re-derived stand-in).
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockRow = null;      // org_config row for key 'eom_digest_config', or null (no row saved yet)
let _mockErrorOnce = null; // injected once, then cleared
let _lastUpsert = null;   // { table, row, opts }

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: () => {
            if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
            return Promise.resolve({ data: _mockRow, error: null });
          },
        };
        return chain;
      },
      upsert: (row, opts) => { _lastUpsert = { table, row, opts }; return Promise.resolve({ data: row, error: null }); },
    }),
  }),
}));

const { loadEomDigestConfig, saveEomDigestConfig } = await import('../lib/supabase.js');
const { DEFAULT_EOM_DIGEST_CONFIG } = await import('../engine/eom-digest.js');

beforeEach(() => { _mockRow = null; _mockErrorOnce = null; _lastUpsert = null; });

describe('loadEomDigestConfig', () => {
  it('returns the default (district+patch, 6pm CT/23 UTC) when no row exists yet — a fresh install behaves identically to #215\'s original hardcoded behavior', async () => {
    const cfg = await loadEomDigestConfig();
    expect(cfg).toEqual(DEFAULT_EOM_DIGEST_CONFIG);
    expect(cfg.levels).toEqual(['district', 'patch']);
    expect(cfg.sendHourUtc).toBe(23);
  });

  it('round-trips a real saved row', async () => {
    _mockRow = { data: { levels: ['district', 'patch', 'org'], sendHourUtc: 14 } };
    const cfg = await loadEomDigestConfig();
    expect(cfg).toEqual({ levels: ['district', 'patch', 'org'], sendHourUtc: 14 });
  });

  it('falls back to the default levels/hour independently if the stored row is missing one field', async () => {
    _mockRow = { data: { sendHourUtc: 9 } }; // no levels key at all
    const cfg = await loadEomDigestConfig();
    expect(cfg.levels).toEqual(DEFAULT_EOM_DIGEST_CONFIG.levels);
    expect(cfg.sendHourUtc).toBe(9);
  });

  it('falls back to the default entirely on a Supabase error, never throws', async () => {
    _mockErrorOnce = { message: 'connection reset' };
    const cfg = await loadEomDigestConfig();
    expect(cfg).toEqual(DEFAULT_EOM_DIGEST_CONFIG);
  });
});

describe('saveEomDigestConfig', () => {
  it('upserts to org_config under key eom_digest_config, onConflict key', async () => {
    const r = await saveEomDigestConfig({ levels: ['district'], sendHourUtc: 8 });
    expect(r.saved).toBe(true);
    expect(_lastUpsert.table).toBe('org_config');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'key' });
    expect(_lastUpsert.row.key).toBe('eom_digest_config');
    expect(_lastUpsert.row.data).toEqual({ levels: ['district'], sendHourUtc: 8 });
  });

  it('a subsequent load reflects the just-saved row (full round-trip through both functions)', async () => {
    await saveEomDigestConfig({ levels: ['patch', 'org'], sendHourUtc: 20 });
    _mockRow = { data: _lastUpsert.row.data };
    const cfg = await loadEomDigestConfig();
    expect(cfg).toEqual({ levels: ['patch', 'org'], sendHourUtc: 20 });
  });

  it('substitutes the default levels when given an empty array, rather than saving nothing selected', async () => {
    await saveEomDigestConfig({ levels: [], sendHourUtc: 23 });
    expect(_lastUpsert.row.data.levels).toEqual(DEFAULT_EOM_DIGEST_CONFIG.levels);
  });

  it('substitutes the default hour when given a non-integer value', async () => {
    await saveEomDigestConfig({ levels: ['district'], sendHourUtc: null });
    expect(_lastUpsert.row.data.sendHourUtc).toBe(DEFAULT_EOM_DIGEST_CONFIG.sendHourUtc);
  });
});
