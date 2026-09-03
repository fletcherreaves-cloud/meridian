// @ts-nocheck
// fob-report.js's leadershipMath had zero direct test coverage despite being live: the sole
// call site (buildFobReport's leadership summary) feeds the district's dollar-weighted FOB%
// and the laggard-vs-achiever savings-erosion math straight to the UI.
import { describe, it, expect } from 'vitest';
import { leadershipMath } from '../engine/fob-report.js';

describe('leadershipMath', () => {
  it('returns all-null/zero for an empty report set', () => {
    const r = leadershipMath([]);
    expect(r).toEqual({
      districtFobPct: null, districtTarget: null, districtGapPP: null,
      totFob: 0, totSales: 0, laggards: [], achievers: [], excess: 0, savings: 0, net: 0, erased: 0, nStores: 0,
    });
  });

  it('dollar-weights the district FOB% and target (never a plain average of per-store %s)', () => {
    const reports = [
      { loc: '1', fobPct: 0.03, sales: 100000, fobDollars: 3000, target: 0.025, overTarget: true, underTarget: false, oppDollars: 500 },
      { loc: '2', fobPct: 0.02, sales: 50000, fobDollars: 1000, target: 0.025, overTarget: false, underTarget: true, savingsDollars: 250 },
    ];
    const r = leadershipMath(reports);
    expect(r.totFob).toBe(4000);
    expect(r.totSales).toBe(150000);
    expect(r.districtFobPct).toBeCloseTo(4000 / 150000, 6);
    expect(r.districtTarget).toBeCloseTo(0.025, 6);
    expect(r.districtGapPP).toBe(0.17); // (4000/150000 - 0.025) in percentage points, 2dp
    expect(r.nStores).toBe(2);
  });

  it('computes excess (laggard overage) and savings (achiever underage) as plain sums', () => {
    const reports = [
      { loc: '1', fobPct: 0.03, sales: 100000, fobDollars: 3000, target: 0.025, overTarget: true, underTarget: false, oppDollars: 500 },
      { loc: '2', fobPct: 0.02, sales: 50000, fobDollars: 1000, target: 0.025, overTarget: false, underTarget: true, savingsDollars: 250 },
    ];
    const r = leadershipMath(reports);
    expect(r.excess).toBe(500);
    expect(r.savings).toBe(250);
    expect(r.net).toBe(250);   // district is net OVER target once achiever savings are netted out
    expect(r.erased).toBe(250); // the smaller of excess/savings -- achiever savings the laggards ate
  });

  it('sorts laggards by oppDollars descending and achievers by savingsDollars descending', () => {
    const reports = [
      { loc: 'a', fobPct: 0.03, sales: 10000, fobDollars: 300, target: 0.025, overTarget: true, underTarget: false, oppDollars: 100 },
      { loc: 'b', fobPct: 0.04, sales: 10000, fobDollars: 400, target: 0.025, overTarget: true, underTarget: false, oppDollars: 500 },
      { loc: 'c', fobPct: 0.035, sales: 10000, fobDollars: 350, target: 0.025, overTarget: true, underTarget: false, oppDollars: 300 },
    ];
    const r = leadershipMath(reports);
    expect(r.laggards.map(x => x.loc)).toEqual(['b', 'c', 'a']);
  });

  it('excludes a store with no fobPct or no sales from every aggregate', () => {
    const reports = [
      { loc: '1', fobPct: 0.03, sales: 100000, fobDollars: 3000, target: 0.025, overTarget: true, underTarget: false, oppDollars: 500 },
      { loc: '2', fobPct: null, sales: 50000, fobDollars: 1000, target: 0.025, overTarget: false, underTarget: true, savingsDollars: 250 },
      { loc: '3', fobPct: 0.02, sales: 0, fobDollars: 0, target: 0.025, overTarget: false, underTarget: true, savingsDollars: 999 },
    ];
    const r = leadershipMath(reports);
    expect(r.nStores).toBe(1);
    expect(r.laggards.map(x => x.loc)).toEqual(['1']);
    expect(r.achievers).toEqual([]);
  });
});
