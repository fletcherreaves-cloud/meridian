// @ts-nocheck
// computeOepeDollarGap extracted from views/store-analytics.js's computeRevenueOpportunity
// (Decisions Panel Inventory salvage #4) — this locks in the formula stays byte-identical to
// what RevenueIntelligence already shipped, and gives attention-feed.js's slowDT detector a
// real $ value instead of the hardcoded 0 its own header comment used to complain about.
import { describe, it, expect } from 'vitest';
import { computeOepeDollarGap } from '../engine/revenue-opportunity.js';

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
