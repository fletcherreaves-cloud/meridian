import { describe, it, expect } from 'vitest';
import { buildDistrictSummary } from '../engine/eom-district-summary.js';

// A small store that finished and a big store that didn't. The mean of the two
// percentages is 75%; the district actually counted 240 of 440 items = 54.5%.
// That gap is what item-weighting fixes.
const mkStore = (loc, earlyCounted, earlyTotal) => ({
  loc,
  name: `Store ${loc}`,
  prog: {
    earlyCounted, earlyTotal,
    earlyPctCounted: earlyTotal ? earlyCounted / earlyTotal : 0,
    itemsCounted: earlyCounted, itemsTotal: earlyTotal,
    pctCounted: earlyTotal ? earlyCounted / earlyTotal : 0,
    believesDone: earlyTotal > 0 && earlyCounted / earlyTotal >= 0.9,
    byClass: {},
  },
});

describe('district avgCountPct is item-weighted', () => {
  it('divides total items counted by total items, not by store count', () => {
    const res = buildDistrictSummary([
      mkStore('1001', 40, 40),    // 100%, small
      mkStore('1002', 200, 400),  // 50%,  big
    ], {});
    // 240 / 440 = 0.5454…, NOT (1.00 + 0.50) / 2 = 0.75
    expect(res.completion.avgCountPct).toBeCloseTo(240 / 440, 6);
  });

  it('differs from the mean of store percentages — the point of the change', () => {
    const res = buildDistrictSummary([
      mkStore('1001', 40, 40),
      mkStore('1002', 200, 400),
    ], {});
    expect(res.completion.avgCountPct).not.toBeCloseTo(0.75, 2);
  });

  it('agrees with the mean when every store has the same item count', () => {
    const res = buildDistrictSummary([
      mkStore('1001', 100, 100),
      mkStore('1002', 50, 100),
    ], {});
    expect(res.completion.avgCountPct).toBeCloseTo(0.75, 6);
  });

  it('falls back to the old mean when no store reports item counts', () => {
    const noItems = [{
      loc: '1001', name: 'A',
      prog: { earlyTotal: 0, earlyCounted: 0, itemsTotal: 0, itemsCounted: 0,
              earlyPctCounted: 0.4, pctCounted: 0.4, byClass: {} },
    }];
    const res = buildDistrictSummary(noItems, {});
    expect(res.completion.avgCountPct).toBeCloseTo(0.4, 6);
  });

  it('returns null rather than NaN when there is nothing to report', () => {
    const res = buildDistrictSummary([], {});
    expect(res.completion.avgCountPct).toBeNull();
  });

  it('uses the early-class basis when present, matching the per-store percentage', () => {
    // earlyTotal > 0 → early basis wins over the wider all-class counts.
    const s = {
      loc: '1001', name: 'A',
      prog: {
        earlyCounted: 30, earlyTotal: 60, earlyPctCounted: 0.5,
        itemsCounted: 90, itemsTotal: 100, pctCounted: 0.9,
        believesDone: false, byClass: {},
      },
    };
    const res = buildDistrictSummary([s], {});
    expect(res.completion.avgCountPct).toBeCloseTo(0.5, 6);
  });
});
