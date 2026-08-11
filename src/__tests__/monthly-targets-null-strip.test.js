// @ts-nocheck
// #166: monthly_targets loaders mapped every column unconditionally, so a NULL column
// produced a PRESENT key holding `null` rather than an absent key. App.js's mergedTargets
// spreads DEFAULT_TARGETS first, then the monthly-target row on top — a present-but-null key
// wins the spread and erases a good default; an absent key would fall through instead.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockRows = [];

// Mock only the supabase-js client factory — src/lib/supabase.js's real mapping/stripping
// code still runs, exactly like production, just against fake rows instead of a live network
// call. `.env.local` in this repo carries real Supabase credentials, so without this mock
// `createClient` would build a client pointed at the live project.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          then: (resolve) => resolve({ data: _mockRows, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

const { loadMonthlyTargets, loadAllMonthlyTargets } = await import('../lib/supabase.js');
const { DEFAULT_TARGETS } = await import('../constants.js');

beforeEach(() => { _mockRows = []; });

describe('#166 — monthly_targets loaders strip null/undefined columns', () => {
  it('loadMonthlyTargets: a null crew_labor_pct produces an ABSENT tCrewLabor key, not a present null', async () => {
    _mockRows = [{ loc: '10422', year: 2026, month: 8, crew_labor_pct: null, tpph_target: 5.4 }];
    const mt = await loadMonthlyTargets(2026, 8);
    expect('tCrewLabor' in mt['10422']).toBe(false);
    expect(mt['10422'].tTpph).toBe(5.4); // a real value still comes through unstripped
  });

  it('loadMonthlyTargets: the null-stripped row leaves DEFAULT_TARGETS intact after the real App.js merge order', async () => {
    const loc = '10422';
    const goodDefault = DEFAULT_TARGETS[loc].tCrewLabor;
    expect(goodDefault).toBeGreaterThan(0); // sanity: this store has a real seeded default
    _mockRows = [{ loc, year: 2026, month: 8, crew_labor_pct: null }];
    const mt = await loadMonthlyTargets(2026, 8);
    // App.js: merged[loc] = {...DEFAULT_TARGETS[loc], ...(monthlyTargets[loc]||{}), ...}
    const merged = { ...DEFAULT_TARGETS[loc], ...(mt[loc] || {}) };
    expect(merged.tCrewLabor).toBe(goodDefault); // NOT null — the pre-fix bug would erase it here
  });

  it('loadMonthlyTargets: a real (non-null) value still wins the merge over DEFAULT_TARGETS, unaffected', async () => {
    const loc = '10422';
    _mockRows = [{ loc, year: 2026, month: 8, crew_labor_pct: 0.24 }];
    const mt = await loadMonthlyTargets(2026, 8);
    const merged = { ...DEFAULT_TARGETS[loc], ...(mt[loc] || {}) };
    expect(merged.tCrewLabor).toBeCloseTo(0.24, 5);
  });

  it('loadMonthlyTargets: 27 well-formed stores resolve identical, unchanged targets (no-op for good data)', async () => {
    const locs = Object.keys(DEFAULT_TARGETS).slice(0, 27);
    _mockRows = locs.map(loc => ({
      loc, year: 2026, month: 8,
      crew_labor_pct: 0.24, tpph_target: 5.5, sales_proj: 300000,
    }));
    const mt = await loadMonthlyTargets(2026, 8);
    for (const loc of locs) {
      const merged = { ...DEFAULT_TARGETS[loc], ...(mt[loc] || {}) };
      expect(merged.tCrewLabor).toBeCloseTo(0.24, 5);
      expect(merged.tTpph).toBeCloseTo(5.5, 5);
      expect(merged.tProdSales).toBe(300000);
    }
  });

  it('loadMonthlyTargets: returns {} without a valid year/month (the removed argless-limit(27) branch is gone, not silently kept)', async () => {
    _mockRows = [{ loc: '10422', year: 2026, month: 8, crew_labor_pct: 0.24 }];
    expect(await loadMonthlyTargets()).toEqual({});
    expect(await loadMonthlyTargets(null, null)).toEqual({});
  });

  it('loadAllMonthlyTargets: strips nulls the same way, per period', async () => {
    _mockRows = [
      { loc: '10422', year: 2026, month: 8, crew_labor_pct: null, tpph_target: 5.4 },
      { loc: '10422', year: 2026, month: 7, crew_labor_pct: 0.22 },
    ];
    const all = await loadAllMonthlyTargets();
    expect('tCrewLabor' in all['2026-8']['10422']).toBe(false);
    expect(all['2026-8']['10422'].tTpph).toBe(5.4);
    expect(all['2026-7']['10422'].tCrewLabor).toBeCloseTo(0.22, 5);
  });
});
