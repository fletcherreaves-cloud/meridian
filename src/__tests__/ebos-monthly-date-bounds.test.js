// @ts-nocheck
// #365 — loadEbosMonthlyByStore (src/lib/supabase.js) hardcoded its upper date bound to
// `${y}-${m}-31`. MEASURED against live Supabase, not assumed: a direct REST call with
// `date=lte.2026-02-31` returns Postgres error 22008 ("date/time field value out of range") —
// invalid, since February never has a 31st. Because the caller's `if (error) { ...; return {}; }`
// swallows the error, this silently returned an EMPTY op-supplies map for every month with fewer
// than 31 days (Feb/Apr/Jun/Sep/Nov — 5 of 12), with nothing visible past a console.error.
//
// Drives the fix through the real exported loadEbosMonthlyByStore against a mock Supabase client
// that RECORDS the exact date bounds passed to .gte()/.lte(), the only way to assert on the
// bound value itself (a live call either errors or silently returns [], neither of which proves
// what bound was actually sent).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __fakeConfig = { rows: [] };
const __calls = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const builder = {
        _gte: null, _lte: null,
        select() { return builder; },
        gte(col, val) { builder._gte = val; return builder; },
        lte(col, val) {
          builder._lte = val;
          __calls.push({ table, gte: builder._gte, lte: val });
          return Promise.resolve({ data: __fakeConfig.rows, error: null });
        },
      };
      return builder;
    },
  }),
}));

let loadEbosMonthlyByStore;
beforeEach(async () => {
  vi.resetModules();
  __calls.length = 0;
  __fakeConfig.rows = [];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadEbosMonthlyByStore } = await import('../lib/supabase.js'));
});

describe('#365 loadEbosMonthlyByStore date bounds', () => {
  it('uses the REAL last day of a 28-day February, not a hardcoded 31', async () => {
    await loadEbosMonthlyByStore(2026, 2);
    expect(__calls[0].gte).toBe('2026-02-01');
    expect(__calls[0].lte).toBe('2026-02-28');   // 2026 is not a leap year
  });

  it('uses the real last day of a 30-day month (April)', async () => {
    await loadEbosMonthlyByStore(2026, 4);
    expect(__calls[0].lte).toBe('2026-04-30');
  });

  it('a 31-day month is unaffected (already worked before the fix)', async () => {
    await loadEbosMonthlyByStore(2026, 1);
    expect(__calls[0].lte).toBe('2026-01-31');
  });

  it('handles a leap-year February correctly (2028)', async () => {
    await loadEbosMonthlyByStore(2028, 2);
    expect(__calls[0].lte).toBe('2028-02-29');
  });

  it('still sums ops_purchases per store once the query actually returns rows', async () => {
    __fakeConfig.rows = [
      { loc: '0010422', ops_purchases: 100 },
      { loc: '0010422', ops_purchases: 50 },
      { loc: '0005183', ops_purchases: 25 },
    ];
    const map = await loadEbosMonthlyByStore(2026, 2);
    expect(map['10422']).toBe(150);
    expect(map['5183']).toBe(25);
  });
});
