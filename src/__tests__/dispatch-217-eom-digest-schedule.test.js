// @ts-nocheck
// Dispatch #217 — EOM digest settings: configurable levels + send hour.
//
// Covers the two pure pieces scripts/eom-digest-send.mjs gained: levelsToRun(config) now
// sourcing its default from the loaded org_config (instead of a hardcoded ['district','patch']
// literal) while DIGEST_LEVEL, when explicitly set, still wins unconditionally — proving the
// on-demand panel path (which always passes an explicit level via trigger-dar-sync's `digest`
// workflow entry) is completely unaffected by this change — and hourGatePasses(), the new
// hour-gate that lets a configurable `sendHourUtc` mean something without a YAML edit every
// time it changes. Same "exercise the real pure exports, mocked-nothing" technique the existing
// eom-digest-send.test.js uses for classStatusesFromStatusAndLog — levelsToRun/hourGatePasses
// are the other genuinely pure pieces of this script (bootstrapLiveOrg/buildStoreRows/main
// still require a live Supabase round-trip per that file's own note).
//
// No dummy env vars needed: eom-digest-send.mjs's module-scope `supabase` const goes through
// safeCreateClient (scripts/lib/safe-supabase-client.mjs), which never throws regardless of
// what's in process.env at import time — see that helper's own header for the real CI incident
// (env-var leakage across test files sharing a Vitest worker, which once poisoned a completely
// unrelated script's client construction and crashed on Node 20's missing native WebSocket) this
// closes. A raw `process.env.X = process.env.X || 'dummy'` assignment used to sit here — that was
// itself the leak source, and removing the need for it removes the leak at its origin.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { hourGatePasses } from '../../scripts/eom-digest-send.mjs';
import { DEFAULT_EOM_DIGEST_CONFIG } from '../engine/eom-digest.js';

// levelsToRun() reads process.env.DIGEST_LEVEL into a module-scope constant AT IMPORT TIME
// (same pattern the pre-existing LEVEL_ARG always used), so exercising different env values
// needs vi.resetModules() + a fresh dynamic import per case — a plain re-call of an
// already-imported levelsToRun would still see whatever DIGEST_LEVEL was set at first import.
describe('levelsToRun(config) — dispatch #217: config-sourced default, DIGEST_LEVEL override unaffected', () => {
  afterEach(() => { delete process.env.DIGEST_LEVEL; vi.resetModules(); });

  it('with DIGEST_LEVEL unset, defaults to the LOADED CONFIG\'s levels (not a hardcoded literal)', async () => {
    delete process.env.DIGEST_LEVEL;
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun({ levels: ['district', 'patch', 'org'], sendHourUtc: 23 })).toEqual(['district', 'patch', 'org']);
    expect(mod.levelsToRun({ levels: ['org'], sendHourUtc: 23 })).toEqual(['org']);
  });

  it('falls back to DEFAULT_EOM_DIGEST_CONFIG.levels when called with no config argument at all (mirrors a fresh install with no saved org_config row)', async () => {
    delete process.env.DIGEST_LEVEL;
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun()).toEqual(DEFAULT_EOM_DIGEST_CONFIG.levels);
    expect(mod.levelsToRun()).toEqual(['district', 'patch']);
  });

  it('an explicit DIGEST_LEVEL="org" wins over the config unconditionally — proves the on-demand panel path (which always sets DIGEST_LEVEL) is unaffected by this change', async () => {
    process.env.DIGEST_LEVEL = 'org';
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    // Config says district+patch only — DIGEST_LEVEL still overrides to just 'org'.
    expect(mod.levelsToRun({ levels: ['district', 'patch'], sendHourUtc: 23 })).toEqual(['org']);
  });

  it('an explicit DIGEST_LEVEL="district" (the on-demand panel\'s single-level send) wins even when the configured schedule omits district entirely', async () => {
    process.env.DIGEST_LEVEL = 'district';
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun({ levels: ['patch', 'org'], sendHourUtc: 23 })).toEqual(['district']);
  });

  it('DIGEST_LEVEL="all" still overrides to every level regardless of config — now including operator (dispatch #224 Task 3)', async () => {
    process.env.DIGEST_LEVEL = 'all';
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun({ levels: ['district'], sendHourUtc: 23 })).toEqual(['district', 'patch', 'org', 'operator']);
  });

  it('DIGEST_LEVEL="operator" (the on-demand panel\'s Operator-tab send) wins over the config unconditionally', async () => {
    process.env.DIGEST_LEVEL = 'operator';
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun({ levels: ['district', 'patch'], sendHourUtc: 23 })).toEqual(['operator']);
  });

  it('an unrecognized DIGEST_LEVEL value is ignored, falling through to the config (same as the pre-existing unrecognized-value behavior)', async () => {
    process.env.DIGEST_LEVEL = 'bogus';
    vi.resetModules();
    const mod = await import('../../scripts/eom-digest-send.mjs');
    expect(mod.levelsToRun({ levels: ['org'], sendHourUtc: 23 })).toEqual(['org']);
  });
});

describe('hourGatePasses — dispatch #217 new hour-gate, realistic timestamp fixtures', () => {
  it('a UTC hour matching the configured sendHourUtc proceeds', () => {
    // 2026-08-29T23:30:00Z -> UTC hour 23
    expect(hourGatePasses(23, new Date('2026-08-29T23:30:00Z'))).toBe(true);
  });
  it('a UTC hour NOT matching the configured sendHourUtc no-ops', () => {
    // 2026-08-29T22:59:00Z -> UTC hour 22, configured for 23
    expect(hourGatePasses(23, new Date('2026-08-29T22:59:00Z'))).toBe(false);
    // one hour past the configured hour also fails
    expect(hourGatePasses(23, new Date('2026-08-30T00:05:00Z'))).toBe(false);
  });
  it('force=true bypasses the gate even on a completely non-matching hour', () => {
    expect(hourGatePasses(23, new Date('2026-08-29T09:00:00Z'), true)).toBe(true);
  });
  it('an exact hour boundary (:00:00) matches', () => {
    expect(hourGatePasses(9, new Date('2026-08-29T09:00:00Z'))).toBe(true);
  });
  it('an exact hour boundary just before rollover (:59:59) still matches the earlier hour', () => {
    expect(hourGatePasses(9, new Date('2026-08-29T09:59:59Z'))).toBe(true);
    expect(hourGatePasses(9, new Date('2026-08-29T10:00:00Z'))).toBe(false);
  });
  it('defaults sendHourUtc to the DEFAULT_EOM_DIGEST_CONFIG value (23) matching #215\'s original 6pm CT cron when no explicit hour is configured', () => {
    expect(hourGatePasses(DEFAULT_EOM_DIGEST_CONFIG.sendHourUtc, new Date('2026-08-29T23:00:00Z'))).toBe(true);
  });
});
