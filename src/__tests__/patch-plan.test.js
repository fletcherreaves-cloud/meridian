// @ts-nocheck
// The Patch engine (owner request 2026-11-07) -- computePatchRollup()/computePatchMap()/
// rankNeedsAttention().
import { describe, it, expect } from 'vitest';
import { computePatchRollup, computePatchMap, rankNeedsAttention, computePatchStandings } from '../engine/patch-plan.js';
import { supervisorGroups } from '../constants.js';

function store(loc, name, over) {
  return { loc, name, hasData: true, severity: 'GREEN', sales: null, vsLYSales: null,
    laborPct: null, smgOsat: null, flags: [], ...over };
}

describe('computePatchRollup', () => {
  it('dollar-weights vs-LY across stores (never averages the per-store percentages directly)', () => {
    // Store A: $10,000 at +10% vs LY -> implied LY $9,090.91
    // Store B: $1,000 at -50% vs LY -> implied LY $2,000
    // A naive average of (+10%, -50%) would be -20%. Dollar-weighted: (11000-11090.91)/11090.91.
    const stores = [
      store('A', 'Store A', { sales: 10000, vsLYSales: 10 }),
      store('B', 'Store B', { sales: 1000, vsLYSales: -50 }),
    ];
    const r = computePatchRollup(stores);
    const expectedLY = 10000 / 1.10 + 1000 / 0.50;
    const expectedPct = ((11000 - expectedLY) / expectedLY) * 100;
    expect(r.vsLYPct).toBeCloseTo(expectedPct, 5);
    expect(r.totalSales).toBe(11000);
  });

  it('excludes a store with no real LY comparison from the vs-LY ratio, but still counts its sales in totalSales', () => {
    const stores = [
      store('A', 'Store A', { sales: 10000, vsLYSales: 10 }),
      store('B', 'Store B', { sales: 5000, vsLYSales: null }),
    ];
    const r = computePatchRollup(stores);
    expect(r.totalSales).toBe(15000);
    expect(r.vsLYPct).toBeCloseTo(10, 5); // only store A has a real LY leg
  });

  it('labor% and OSAT are a simple cross-sectional mean across stores that have a value (a same-day snapshot, not a time series)', () => {
    const stores = [
      store('A', 'Store A', { laborPct: 0.24, smgOsat: 90 }),
      store('B', 'Store B', { laborPct: 0.28, smgOsat: null }),
    ];
    const r = computePatchRollup(stores);
    expect(r.laborPct).toBeCloseTo(0.26, 5);
    expect(r.smgOsat).toBe(90); // only one real value -- not diluted by the missing one
  });

  it('counts stores needing attention (RED or AMBER), excludes GREEN/NODATA', () => {
    const stores = [
      store('A', 'A', { severity: 'RED' }), store('B', 'B', { severity: 'AMBER' }),
      store('C', 'C', { severity: 'GREEN' }), store('D', 'D', { hasData: false, severity: 'NODATA' }),
    ];
    expect(computePatchRollup(stores).needsAttention).toBe(2);
    expect(computePatchRollup(stores).storeCount).toBe(3); // D has no data, excluded from storeCount
  });

  it('a patch with zero stores (or zero real data) returns nulls, not NaN or zero-as-fact', () => {
    const r = computePatchRollup([]);
    expect(r.vsLYPct).toBeNull();
    expect(r.laborPct).toBeNull();
    expect(r.smgOsat).toBeNull();
    expect(r.totalSales).toBe(0);
  });
});

describe('computePatchMap', () => {
  it('places real stores using their real INV_ORG_COORDS lat/lng, normalized into [0,1]', () => {
    // 3708 and 5183 are real seeded coords in src/constants.js.
    const stores = [store('3708', 'Ardmore', { severity: 'RED' }), store('5183', 'Chickasha', { severity: 'GREEN' })];
    const points = computePatchMap(stores);
    expect(points.length).toBe(2);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('drops a store with no real coordinates rather than guessing a position', () => {
    const stores = [store('3708', 'Ardmore'), store('NOT-A-REAL-LOC', 'Nowhere')];
    const points = computePatchMap(stores);
    expect(points.length).toBe(1);
    expect(points[0].loc).toBe('3708');
  });

  it('returns an empty array, not a crash, for zero stores', () => {
    expect(computePatchMap([])).toEqual([]);
  });
});

describe('rankNeedsAttention', () => {
  it('ranks RED before AMBER, excludes GREEN/NODATA entirely', () => {
    const stores = [
      store('A', 'A', { severity: 'AMBER', flags: [{ headline: 'Amber issue' }] }),
      store('B', 'B', { severity: 'RED', flags: [{ headline: 'Red issue' }] }),
      store('C', 'C', { severity: 'GREEN', flags: [] }),
    ];
    const ranked = rankNeedsAttention(stores);
    expect(ranked.map(r => r.loc)).toEqual(['B', 'A']);
    expect(ranked[0].why).toBe('Red issue');
  });

  it('reports how many additional flags exist beyond the first, never fabricating their content', () => {
    const stores = [store('A', 'A', { severity: 'RED', flags: [{ headline: 'One' }, { headline: 'Two' }, { headline: 'Three' }] })];
    const ranked = rankNeedsAttention(stores);
    expect(ranked[0].why).toBe('One');
    expect(ranked[0].moreCount).toBe(2);
  });

  it('a store with no flags at all (shouldn\'t normally happen for RED/AMBER) gets a null why, not a fabricated one', () => {
    const stores = [store('A', 'A', { severity: 'RED', flags: [] })];
    expect(rankNeedsAttention(stores)[0].why).toBeNull();
  });
});

// Fresh-eyes role audit (2026-11-11, §2 Q3) -- groups stores by the REAL live supervisorOf()
// lookup, not a hardcoded loc->supervisor map, since who supervises what is a live-settable
// timeline (constants.js's whoRan/orgAssignments). Pulls two currently-different real
// supervisors' own stores from supervisorGroups() at test time instead of hardcoding names, so
// this doesn't drift if the org chart changes.
describe('computePatchStandings', () => {
  const groups = supervisorGroups();
  const supNames = Object.keys(groups).filter(n => (groups[n] || []).length > 0);

  it('returns null when every store resolves to the same patch (nothing to rank against -- the real Area Supervisor case)', () => {
    const name = supNames.find(n => groups[n].length >= 2) || supNames[0];
    const locs = groups[name].slice(0, 2);
    const stores = locs.map(loc => store(loc, loc, { sales: 1000, vsLYSales: 5 }));
    expect(computePatchStandings(stores)).toBeNull();
  });

  it('ranks 2+ real patches by vs-LY% descending when the caller\'s own stores span more than one', () => {
    expect(supNames.length).toBeGreaterThanOrEqual(2); // sanity: real org data must have 2+ supervisors
    const locA = groups[supNames[0]][0], locB = groups[supNames[1]][0];
    const stores = [
      store(locA, 'A', { sales: 10000, vsLYSales: 20 }),  // best growth
      store(locB, 'B', { sales: 10000, vsLYSales: -10 }), // worst growth
    ];
    const standings = computePatchStandings(stores);
    expect(standings).toHaveLength(2);
    expect(standings[0].patch).toBe(supNames[0]);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].patch).toBe(supNames[1]);
    expect(standings[1].rank).toBe(2);
    expect(standings.every(r => r.total === 2)).toBe(true);
  });

  it('a patch with no real vs-LY comparison sorts last, never scored as "worst" by a fabricated 0', () => {
    const locA = groups[supNames[0]][0], locB = groups[supNames[1]][0];
    const stores = [
      store(locA, 'A', { sales: 10000, vsLYSales: -30 }), // real, bad number
      store(locB, 'B', { sales: 10000, vsLYSales: null }), // no comparison at all
    ];
    const standings = computePatchStandings(stores);
    expect(standings[0].patch).toBe(supNames[0]); // real number, however bad, outranks "no data"
    expect(standings[1].vsLYPct).toBeNull();
  });
});
