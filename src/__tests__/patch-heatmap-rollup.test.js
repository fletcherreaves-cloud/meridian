// @ts-nocheck
// #220 — Patch Heatmap rollup tiles. Guards the issue's own explicit trap: a patch must be
// coloured from AGGREGATED underlying data (dollar/sales-weighted), never by its worst store,
// and never by averaging per-store percentages.
import { describe, it, expect } from 'vitest';
import { patchDimensions, storeDimensions, bandFromGap } from '../views/patch-heatmap.js';

describe('patchDimensions — Sales: sums raw dollars, not an average of per-store %', () => {
  it('a small store crashing does not equal-weight against a big store doing fine', () => {
    const members = [
      { store: { pSales: 900, pLY: 1000 }, fobRow: null },  // -10% but tiny
      { store: { pSales: 9000, pLY: 9000 }, fobRow: null }, // flat, huge
    ];
    const dims = patchDimensions(members);
    const sales = dims.find(d => d.label === 'Sales');
    // Naive average of (-10%, 0%) would be -5%. Dollar-weighted: (9900-10000)/10000 = -1%.
    expect(sales.detail).toContain('-1.0%');
  });
});

describe('patchDimensions — FOB: sums $ fob / $ sales, target is sales-weighted', () => {
  it('matches a hand-computed dollar-weighted aggregate, not a simple mean', () => {
    const members = [
      { store: { t: { tFOBTarget: 0.04 } }, fobRow: { sales: 1000, fob: 50, fobPct: 0.05 } },  // 5%, small
      { store: { t: { tFOBTarget: 0.04 } }, fobRow: { sales: 9000, fob: 360, fobPct: 0.04 } },  // 4%, huge
    ];
    const dims = patchDimensions(members);
    const fob = dims.find(d => d.label === 'FOB');
    // Naive mean of (5%, 4%) = 4.5%. Dollar-weighted: (50+360)/(1000+9000) = 4.1%.
    expect(fob.detail).toContain('4.10%');
  });

  it('the target itself is sales-weighted across the same member stores', () => {
    const members = [
      { store: { t: { tFOBTarget: 0.06 } }, fobRow: { sales: 1000, fob: 40, fobPct: 0.04 } },
      { store: { t: { tFOBTarget: 0.02 } }, fobRow: { sales: 9000, fob: 360, fobPct: 0.04 } },
    ];
    const dims = patchDimensions(members);
    const fob = dims.find(d => d.label === 'FOB');
    // Weighted target = (0.06*1000 + 0.02*9000)/10000 = 0.024 = 2.40%
    expect(fob.detail).toContain('2.40%');
  });
});

describe('patchDimensions — Labor & Speed: sales-weighted averages', () => {
  it('Labor % is sales-weighted, not a flat mean across stores', () => {
    const members = [
      { store: { pSales: 1000, t: { tCrewLabor: 0.22 }, p: { laborPct: 0.30 } } }, // small, way over
      { store: { pSales: 9000, t: { tCrewLabor: 0.22 }, p: { laborPct: 0.22 } } }, // huge, on target
    ];
    const dims = patchDimensions(members);
    const labor = dims.find(d => d.label === 'Labor');
    // Naive mean of (30%, 22%) = 26%. Sales-weighted: (0.30*1000+0.22*9000)/10000 = 22.8%
    expect(labor.detail).toContain('22.80%');
  });

  it('Speed (OEPE) is sales-weighted seconds, not a flat mean', () => {
    const members = [
      { store: { pSales: 1000, t: { tOepe: 120 }, p: { oepe: 300 } } }, // small, way slow
      { store: { pSales: 9000, t: { tOepe: 120 }, p: { oepe: 120 } } }, // huge, on target
    ];
    const dims = patchDimensions(members);
    const speed = dims.find(d => d.label === 'Speed');
    // Naive mean of (300,120) = 210s. Sales-weighted: (300*1000+120*9000)/10000 = 138s
    expect(speed.detail).toContain('138s');
  });
});

describe('patchDimensions — Controls is deliberately excluded (composite score, #219 precedent)', () => {
  it('never returns a Controls dimension even when member stores have a ctrlScore', () => {
    const members = [{ store: { ctrlScore: 85, pSales: 0 } }, { store: { ctrlScore: 40, pSales: 0 } }];
    const dims = patchDimensions(members);
    expect(dims.find(d => d.label === 'Controls')).toBeUndefined();
  });
});

describe('patchDimensions — missing inputs exclude a dimension, never fabricate one', () => {
  it('a patch with zero members reporting any dimension returns an empty dims array', () => {
    const dims = patchDimensions([{ store: { pSales: 0 } }, { store: { pSales: 0 } }]);
    expect(dims).toEqual([]);
  });

  it('a partial member set still aggregates using only the members that HAVE the data', () => {
    const members = [
      { store: { pSales: 1000, pLY: 1000 } },       // has sales data
      { store: { pSales: 0 } },                      // no sales data — excluded from Sales agg
    ];
    const dims = patchDimensions(members);
    const sales = dims.find(d => d.label === 'Sales');
    expect(sales.detail).toContain('1 store'); // only 1 of 2 members contributed
  });
});

describe('patchDimensions vs storeDimensions — a struggling small store does not paint the whole patch red by itself', () => {
  it('one crashing store diluted by a large healthy store bands clean at the patch level', () => {
    // A store bad enough to be critical on its own...
    const badStore = { pSales: 500, pLY: 1000, t: {}, p: {} }; // -50% vs LY, badAt=27 -> band 0 (critical)
    const badBand = bandFromGap(50, 27);
    expect(badBand).toBeLessThan(50); // confirm the store itself would be critical

    // ...but the patch, aggregated with a much bigger healthy store, is not.
    const members = [
      { store: badStore },
      { store: { pSales: 20000, pLY: 20000, t: {}, p: {} } }, // flat, 40x bigger
    ];
    const patchDims = patchDimensions(members);
    const patchSales = patchDims.find(d => d.label === 'Sales');
    // (500+20000-1000-20000)/(1000+20000) = -500/21000 = -2.38%
    expect(patchSales.band).toBeGreaterThan(80); // clean at the patch level
  });
});
