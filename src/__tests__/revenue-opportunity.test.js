// @ts-nocheck
// computeOepeDollarGap extracted from views/store-analytics.js's computeRevenueOpportunity
// (Decisions Panel Inventory salvage #4) — this locks in the formula stays byte-identical to
// what RevenueIntelligence already shipped, and gives attention-feed.js's slowDT detector a
// real $ value instead of the hardcoded 0 its own header comment used to complain about.
import { describe, it, expect } from 'vitest';
import { computeOepeDollarGap, computeDaypartErosion, computeParkOptimization } from '../engine/revenue-opportunity.js';

const daysAgo = n => new Date(Date.now() - n * 86400000);

describe('computeOepeDollarGap', () => {
  it('returns null when the store is not over its OEPE target', () => {
    expect(computeOepeDollarGap({ oepe: 100 }, { tOepe: 120 })).toBeNull();
    expect(computeOepeDollarGap({ oepe: 120 }, { tOepe: 120 })).toBeNull();
  });

  it('returns null when inputs are missing', () => {
    expect(computeOepeDollarGap(null, { tOepe: 120 })).toBeNull();
    expect(computeOepeDollarGap({ oepe: 150 }, null)).toBeNull();
    expect(computeOepeDollarGap({ oepe: 150 }, { tOepe: 0 })).toBeNull();
  });

  it('computes a real dollar value for a store over target', () => {
    const g = computeOepeDollarGap({ oepe: 180, dtGC: 60, avgCheck: 9.0 }, { tOepe: 150 });
    expect(g).not.toBeNull();
    expect(g.gapSec).toBe(30);
    expect(g.dailyOpportunity).toBeGreaterThan(0);
    expect(g.monthlyOpportunity).toBe(+(g.dailyOpportunity * 30).toFixed(0));
    expect(g.valuePerSecond).toBeCloseTo(g.dailyOpportunity / 30, 2);
  });

  it('falls back to a default avgCheck when the store has none', () => {
    const withTpph = computeOepeDollarGap({ oepe: 180, laborPct: 0.3, tpph: 5 }, { tOepe: 150 });
    const withoutTpph = computeOepeDollarGap({ oepe: 180 }, { tOepe: 150 });
    expect(withTpph.avgCheck).toBe(9.50);
    expect(withoutTpph.avgCheck).toBe(8.50);
  });

  it('a larger gap produces a larger daily opportunity', () => {
    const small = computeOepeDollarGap({ oepe: 160, avgCheck: 9 }, { tOepe: 150 });
    const big = computeOepeDollarGap({ oepe: 220, avgCheck: 9 }, { tOepe: 150 });
    expect(big.dailyOpportunity).toBeGreaterThan(small.dailyOpportunity);
  });
});

describe('computeDaypartErosion', () => {
  it('returns null with no peaksSalesRows on ds', () => {
    expect(computeDaypartErosion('a', {}, {})).toBeNull();
  });

  // Row builder: 4 rows per daypart in each window (>=3 required), older window flat at
  // netSales=1000, recent window varying per daypart to produce a real asymmetric signal.
  function rowsFor(loc, recentByDaypart) {
    const rows = [];
    const dayparts = ['breakfast', 'lunch', 'dinner'];
    for (const dp of dayparts) {
      for (let i = 0; i < 4; i++) {
        rows.push({ loc, slice: dp, date: daysAgo(50 + i * 5), netSales: 1000 }); // older window
        rows.push({ loc, slice: dp, date: daysAgo(5 + i * 5), netSales: recentByDaypart[dp] }); // recent window
      }
    }
    return rows;
  }

  it('flags a competitive signal when one daypart erodes while others hold', () => {
    const ds = { peaksSalesRows: rowsFor('a', { breakfast: 1000, lunch: 1000, dinner: 500 }) }; // dinner -50%
    const r = computeDaypartErosion('a', ds, {});
    expect(r).not.toBeNull();
    expect(r.isAsymmetric).toBe(true);
    expect(r.worstSlice).toBe('dinner');
    expect(r.competitiveSignal).toBe(true);
    expect(r.explanation).toContain('Dinner is declining');
  });

  it('does NOT flag a competitive signal when all dayparts decline together', () => {
    const ds = { peaksSalesRows: rowsFor('a', { breakfast: 900, lunch: 900, dinner: 900 }) }; // uniform -10%
    const r = computeDaypartErosion('a', ds, {});
    expect(r).not.toBeNull();
    expect(r.isAsymmetric).toBe(false);
    expect(r.competitiveSignal).toBe(false);
    expect(r.explanation).toContain('traffic, economic, or macro-level');
  });

  it('reports stable when nothing is really moving', () => {
    const ds = { peaksSalesRows: rowsFor('a', { breakfast: 1000, lunch: 1000, dinner: 1000 }) };
    const r = computeDaypartErosion('a', ds, {});
    expect(r.explanation).toContain('stable');
  });

  it('only looks at the requested store\'s own rows', () => {
    const ds = { peaksSalesRows: rowsFor('b', { breakfast: 1000, lunch: 1000, dinner: 500 }) };
    expect(computeDaypartErosion('a', ds, {})).toBeNull();
  });
});

describe('computeParkOptimization', () => {
  // Real-shaped fixtures: a Service-sheet row NEVER carries tpph (parse3PeaksService,
  // src/parsers/index.js), and a Sales-sheet row NEVER carries parkPct (parse3PeaksSales) --
  // this is the exact split that broke the pre-fix code, which filtered ds.peaksSvcRows by
  // r.tpph>0 and so always got zero rows. Matching rows share the same loc/date/slice, the
  // join key.
  function pairedRows(loc, n, parkPctOf, tpphOf) {
    const svc = [], sales = [];
    for (let i = 0; i < n; i++) {
      const date = daysAgo(i);
      svc.push({ loc, slice: 'lunch', date, parkPct: parkPctOf(i) });
      sales.push({ loc, slice: 'lunch', date, tpph: tpphOf(i) });
    }
    return { peaksSvcRows: svc, peaksSalesRows: sales };
  }

  it('returns null without both peaksSvcRows and peaksSalesRows on ds', () => {
    expect(computeParkOptimization('a', { park: 0.15 }, {})).toBeNull();
    expect(computeParkOptimization('a', { park: 0.15 }, { peaksSvcRows: [] })).toBeNull();
    expect(computeParkOptimization('a', { park: 0.15 }, { peaksSalesRows: [] })).toBeNull();
  });

  it('returns null when the store has no current park% to optimize', () => {
    const ds = pairedRows('a', 10, () => 0.15, () => 20);
    expect(computeParkOptimization('a', { park: 0 }, ds)).toBeNull();
  });

  it('the pre-fix bug: joins Service parkPct with Sales tpph by (loc,date,slice) instead of ' +
     'filtering Service rows for a tpph field they never carry', () => {
    // Low park% (10%) -> high TPPH (22); high park% (25%) -> low TPPH (14). A join bug that
    // drops every row (the old r.tpph>0 filter on peaksSvcRows) would return null here.
    const ds = pairedRows('a', 10, i => (i % 2 === 0 ? 0.10 : 0.25), i => (i % 2 === 0 ? 22 : 14));
    const r = computeParkOptimization('a', { park: 0.20, tpph: 15 }, ds);
    expect(r).not.toBeNull();
    expect(r.optimalParkPct).toBe(10);
    expect(r.bestTPPH).toBe(22);
    expect(r.currentParkPct).toBe(20);
    expect(r.note).toContain('over-parking');
  });

  it('requires at least 6 joined rows before optimizing', () => {
    const ds = pairedRows('a', 5, () => 0.12, () => 20);
    expect(computeParkOptimization('a', { park: 0.15 }, ds)).toBeNull();
  });

  it('only joins rows for the requested store, not a sibling store\'s rows', () => {
    const ds = pairedRows('b', 10, () => 0.12, () => 20);
    expect(computeParkOptimization('a', { park: 0.15 }, ds)).toBeNull();
  });

  it('a Service row with no matching Sales row (different date/slice) contributes nothing', () => {
    const ds = pairedRows('a', 10, () => 0.12, () => 20);
    // Shift every sales row's slice so none of them key-match their service counterpart.
    ds.peaksSalesRows = ds.peaksSalesRows.map(r => ({ ...r, slice: 'dinner' }));
    expect(computeParkOptimization('a', { park: 0.15 }, ds)).toBeNull();
  });
});
