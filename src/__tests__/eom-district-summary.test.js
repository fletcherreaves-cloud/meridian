import { describe, it, expect } from 'vitest';
import { buildDistrictSummary } from '../engine/eom-district-summary.js';

const targets = {
  '3708': { tFOBTarget: 0.0385, tCondiment: 0.0205, tStatLoss: 0.0105, tCompWaste: 0.002, tRawWaste: 0.0035, tEmpFood: 0.002, tUnex: 0 },
  '5183': { tFOBTarget: 0.039 },
};
const rows = [
  { loc: '0003708', name: 'Ardmore', fob$: 13252, fobPct: 0.0431,
    components: { sales: 307503, comp: 945, raw: 879, cond: 6477, emp: 650, statv: 4324, unex: -23, fob: 13252 },
    prog: { earlyPctCounted: 1, believesDone: true, byClass: { food: { total: 100, counted: 100 } } }, diagnosis: 'pending', comms: 'none' },
  { loc: '0005183', name: 'Chickasha', fob$: 15816, fobPct: 0.0367,   // UNDER target 0.039
    components: { sales: 430762, comp: 266, raw: 1075, cond: 9056, emp: 1356, statv: 4958, unex: -895, fob: 15816 },
    prog: { earlyPctCounted: 0.8, believesDone: false, byClass: { food: { total: 100, counted: 96 } } }, diagnosis: 'pending', comms: 'none' },
];

describe('buildDistrictSummary', () => {
  const s = buildDistrictSummary(rows, targets);
  it('dollar-weights the district FOB roll-up', () => {
    expect(Math.round(s.rollup.fob$)).toBe(29068);
    expect(Math.round(s.rollup.sales)).toBe(738265);
    expect(s.rollup.fobPct).toBeCloseTo(29068 / 738265, 4);
    expect(Math.round(s.rollup.comps.cond)).toBe(15533);   // 6477 + 9056
  });
  it('carries sales-weighted component targets + ±pp (owner Notes 38)', () => {
    // Only 3708 has a Condiment target (0.0205) → weighted target = 0.0205.
    expect(s.rollup.compTgt.cond).toBeCloseTo(0.0205, 4);
    // ±pp = (component % of sales − target) × 100.
    const expDelta = (s.rollup.compPct.cond - 0.0205) * 100;
    expect(s.rollup.compDeltaPp.cond).toBeCloseTo(expDelta, 3);
  });
  it('flags the OVER-target store as the opportunity, ranked by $ over', () => {
    // 3708 is over (4.31% vs 3.85% → +0.46pp on $307k ≈ +$1,415); 5183 is under → not an opportunity.
    expect(s.opportunity.map(o => o.name)).toEqual(['Ardmore']);
    expect(Math.round(s.totalOver$)).toBeGreaterThan(1000);
  });
  it('summarizes count completion + uncounted Food/Condiment', () => {
    expect(s.completion.ready).toBe(1);          // Ardmore believesDone
    expect(s.completion.counting).toBe(1);       // Chickasha
    expect(s.completion.storesWithUncountedFC).toBe(1); // Chickasha 96/100
  });
  it('reports per-class completion — per store and district-wide', () => {
    const ard = s.stores.find(x => x.name === 'Ardmore');
    expect(ard.classPct.food).toBeCloseTo(1, 3);        // 100/100
    const chick = s.stores.find(x => x.name === 'Chickasha');
    expect(chick.classPct.food).toBeCloseTo(0.96, 3);   // 96/100
    // District food = (100+96)/(100+100) = 0.98
    expect(s.completion.byClass.food).toBeCloseTo(0.98, 3);
  });

  it('ranks component opportunity by OVER-TARGET $, not raw $ (owner Notes 38 — Condiments not auto-crowned)', () => {
    // Condiments is the largest raw-$ component ($15,533) but sits near its target → it must NOT be
    // the "biggest opportunity". The winner is the component furthest OVER its own target.
    expect(s.analysis.biggestComp.k).not.toBe('cond');
    const maxOver = s.analysis.compOpp.reduce((a, c) => (c.over$ > a.over$ ? c : a));
    expect(s.analysis.biggestComp.k).toBe(maxOver.k);
    expect(maxOver.over$).toBeGreaterThan(0);
    // Condiments' own opportunity is tiny despite its huge raw $.
    const cond = s.analysis.compOpp.find(c => c.k === 'cond');
    expect(cond.over$).toBeLessThan(maxOver.over$);
  });
  it('per-store FOB delta vs target', () => {
    const ard = s.stores.find(x => x.name === 'Ardmore');
    expect(ard.deltaPp).toBeCloseTo(0.46, 1);        // 4.31 - 3.85
  });
});
