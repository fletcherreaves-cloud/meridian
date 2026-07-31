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

  it('identifies the biggest district component driver + per-store delta', () => {
    expect(s.analysis.biggestComp.k).toBe('cond');   // condiments largest
    const ard = s.stores.find(x => x.name === 'Ardmore');
    expect(ard.deltaPp).toBeCloseTo(0.46, 1);        // 4.31 - 3.85
  });
});
