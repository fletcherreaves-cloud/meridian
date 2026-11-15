// @ts-nocheck
// Live-reported (owner, mobile, weak signal, 2026-11-15): FOB rows on the Targets vs Actual
// report blank or very slow to populate, even after v5.795's load-speed cache fix and
// auto-refresh-on-late-data. Traced to a real gap in _pagedParallel (src/lib/supabase.js),
// the parallel-fan-out loader qsr_fob and 9 other tables (labor_rows, peaks_rows, audit_rows,
// ops_rows, ctrl_rows, daily_glimpse_daily, cash_sheet_daily, sales_ledger_daily,
// qsr_product_mix) all share: its own page-fetch loop had NO retry and NO per-page timeout at
// all — unlike fetchAll's sequential fallback, which already had both (dispatch #218 / the
// hung-page timeout fix). A single transient page failure (statement timeout, egress blip, a
// stalled connection — all common on a weak mobile connection, and qsr_fob's ~33-parallel-page
// fan-out at pageSize 400 is exactly the shape most exposed to it) just silently dropped that
// page's ~400 rows with no second attempt, and on a sufficiently bad connection every page
// failing produces a fully blank read with nothing in the UI to say why.
//
// Fix: _fetchPageWithRetry, extracted from fetchAll's own retry block, is now used by BOTH
// fetchAll and _pagedParallel's page-fetch loop (including its count-safety-extension loop) —
// one shared, already-tested timeout+retry implementation instead of _pagedParallel having
// none at all.
//
// Driven through the real exported loadQsrFob() against a mock Supabase client, mirroring
// paged-parallel-count-fallback.test.js's own mock shape (the only way to force a page-level
// failure deterministically on _pagedParallel's parallel path).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
const __rangeCallsByRange = {};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const cfg = __fakeConfig[table] || { rows: [] };
      const builder = {
        select(_cols, opts) { builder._headMode = !!(opts && opts.head); return builder; },
        gte() { return builder; },
        in() { return builder; },
        order() { return builder; },
        range(from, to) {
          const key = `${from}-${to}`;
          __rangeCallsByRange[key] = (__rangeCallsByRange[key] || 0) + 1;
          const isFirstAttempt = __rangeCallsByRange[key] === 1;
          const shouldFail = cfg.alwaysFail || (cfg.failOnce && cfg.failOnce.has(key) && isFirstAttempt);
          if (shouldFail) {
            return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } });
          }
          return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null });
        },
        then(resolve, reject) {
          const result = cfg.countError
            ? { count: null, error: cfg.countError, data: null }
            : { count: cfg.rows.length, error: null, data: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

function fobRow(i) {
  const d = new Date(2026, 0, 1 + i);
  return { loc: '0010422', date: d.toISOString().slice(0, 10), prod_sales_amt: 1000 + i };
}

let loadQsrFob;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  for (const k of Object.keys(__rangeCallsByRange)) delete __rangeCallsByRange[k];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadQsrFob } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('_pagedParallel retries a failed page instead of silently dropping it (2026-11-15)', () => {
  it('a page that fails ONCE (transient 57014) then succeeds on retry returns ALL rows, not a hole', async () => {
    // pageSize is 400 (loadQsrFob's own call); 401 rows forces 2 pages (0-400, no wait --
    // range is inclusive [from,to], pageSize 400 means page 0 is rows 0-399).
    const rows = Array.from({ length: 401 }, (_, i) => fobRow(i));
    __fakeConfig.qsr_fob = { rows, countError: null, failOnce: new Set(['0-399']) };
    const result = await loadQsrFob({ daysBack: 30 });
    // Before the fix: page "0-399" fails once, _pagedParallel counts it as `failed` and never
    // retries -- those 400 rows are gone for good, only the second page's 1 row comes back.
    expect(result.length).toBe(401);
  });

  it('every page failing every attempt still gives up cleanly (no infinite retry, no hang)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => fobRow(i));
    __fakeConfig.qsr_fob = { rows, countError: null, alwaysFail: true };
    const result = await loadQsrFob({ daysBack: 30 });
    expect(result.length).toBe(0);
  });
});
