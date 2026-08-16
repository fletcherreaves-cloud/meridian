// @ts-nocheck
// #343 — _pagedParallel (src/lib/supabase.js) destructured only `count` off its upfront
// count-HEAD query, silently dropping `error`. A failed count (e.g. a statement timeout on
// an exact count over a big table) made `pages` default to 1, silently capping every read at
// one page of the newest rows with no error surfaced anywhere — shared by all 10 callers
// (qsr_fob, labor_rows, peaks_rows, audit_rows, ops_rows, ctrl_rows, daily_glimpse_daily,
// cash_sheet_daily, sales_ledger_daily, qsr_product_mix), not just the table it was first
// noticed on. Fixed to fall back to fetchAll's sequential-until-short-page strategy, which
// needs no upfront count and so can't under-fetch from a bad one.
//
// _pagedParallel/fetchAll aren't exported (repo convention: underscore-prefixed = internal),
// so this drives the fix through a real exported loader, loadQsrFob, against a mock Supabase
// client — the only way to force a count-HEAD failure deterministically, since one can't be
// manufactured on demand against live infra.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
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
          return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null });
        },
        // Reached only when the builder itself is awaited without a terminal .range() —
        // i.e. the count-HEAD call (`const { count, error } = await head;`).
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
  // supabase.js only calls createClient (mocked above) when VITE_SUPABASE_URL/ANON_KEY are
  // both set — otherwise `supabase` is null and every loader short-circuits to []. This
  // sandbox happens to carry real ambient values (see CLAUDE.md), which masked that CI (no
  // ambient env) hit the null-guard and made every assertion below trivially "pass" against
  // an empty array. Stub deterministically so the test exercises the mock either way.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadQsrFob } = await import('../lib/supabase.js'));
});

afterEach(() => { vi.unstubAllEnvs(); });

describe('_pagedParallel count-HEAD failure fallback (#343)', () => {
  it('a failed count no longer silently caps the read at one page', async () => {
    // 12 rows, well beyond the single default page (400) that the old pages=1 fallback
    // would have returned anyway at this size — the real bug manifests on tables with MORE
    // rows than one page. Use a small dataset here since the fix path (fetchAll) walks
    // pageSize-sized pages regardless of size; what matters is proving no rows are dropped.
    const rows = Array.from({ length: 12 }, (_, i) => fobRow(i));
    __fakeConfig.qsr_fob = { rows, countError: { message: 'canceling statement due to statement timeout' } };
    const result = await loadQsrFob({ daysBack: 30 });
    expect(result.length).toBe(12);
  });

  it('the happy path (count succeeds) is unaffected — same rows as before', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => fobRow(i));
    __fakeConfig.qsr_fob = { rows, countError: null };
    const result = await loadQsrFob({ daysBack: 30 });
    expect(result.length).toBe(5);
  });

  it('an empty table (real legitimate zero, not a count failure) still returns empty, not an error path', async () => {
    __fakeConfig.qsr_fob = { rows: [], countError: null };
    const result = await loadQsrFob({ daysBack: 30 });
    expect(result).toEqual([]);
  });
});
