import { describe, it, expect } from 'vitest';
import {
  computeLaborRow, analyzeStore, aggregateGroup, analyzeSheet,
  hoursOpen, fracToTime, FLH_THRESHOLDS,
} from '../engine/labor-analysis.js';

// Real inputs from the source sheet, store 3708 (row 4). Hours Forecast/Scheduled
// are [h]:mm durations — the PARSER converts day-serials to real hours (×24), so
// the engine takes hours: F=46.2083*24=1109.0, G=62.5208*24=1500.5. Expected
// outputs are the sheet's own displayed results — reproduced cell-for-cell.
const S3708 = {
  loc: '3708', salesFcst: 74379, laborPctActual: 0.2519, gcFcst: 7443,
  hoursFcst: 1109.0, hoursSched: 1500.5,
  schedFixedPct: 0.026, tpph: 4.96, rate: 13.1417313714383, laborTargetOrg: 0.215,
};

describe('labor-analysis — matches the source worksheet (store 3708)', () => {
  const r = computeLaborRow(S3708);
  it('Scheduled Labor $ = C*D', () => expect(r.scheduledLaborD).toBeCloseTo(18736.07, 1));
  it('Target Labor $ = C*L', () => expect(r.targetLaborD).toBeCloseTo(15991.49, 1));
  it('Labor Target +2% = L+0.02', () => expect(r.laborTargetPlus2).toBeCloseTo(0.235, 6));
  it('Projected Hours/Wk (target) = (C*L)/J', () => expect(r.projHrsTarget).toBeCloseTo(1216.85, 1));
  it('Hours ± sched vs forecast = G-F (hours) → 391.5', () => expect(r.hrsVsForecast).toBeCloseTo(391.5, 0));
  it('Hours ± sched vs target = G-O → 283.65', () => expect(r.hrsVsTarget).toBeCloseTo(283.65, 0));
  it('Hours ± sched vs target+2% = G-P → 170.46', () => expect(r.hrsVsTargetPlus2).toBeCloseTo(170.46, 0));
  it('$ ± vs projected (LifeLenz) = Q*J → 5145', () => expect(r.dollarsVsProjLL).toBeCloseTo(5145, -1));
  it('$ ± vs projected (target) = R*J → 3727.68', () => expect(r.dollarsVsTarget).toBeCloseTo(3727.68, 0));
  it('$ ± vs projected (target+2%) = S*J → 2240.1', () => expect(r.dollarsVsTargetPlus2).toBeCloseTo(2240.1, 0));
  it('Recommended Fixed @10% = O*0.1', () => expect(r.recFixed10).toBeCloseTo(121.68, 1));
  it('Combined @25% = O*0.25', () => expect(r.combined25).toBeCloseTo(304.21, 1));
});

describe('labor-analysis — null-safety', () => {
  it('returns nulls when inputs are missing, never NaN', () => {
    const r = computeLaborRow({ salesFcst: null, rate: 0 });
    expect(r.scheduledLaborD).toBeNull();
    expect(r.projHrsTarget).toBeNull();   // div-by-zero rate → null, not Infinity
    expect(Number.isNaN(r.combined25)).toBe(false);
  });
});

describe('labor-analysis — dollar-weighted subtotals (never average of %s)', () => {
  it('recomputes group labor % from Σ$/Σsales, not the mean of store %s', () => {
    // Two very different stores: a big low-% store and a small high-% store.
    const a = analyzeStore({ loc: 'A', salesFcst: 100000, laborPctActual: 0.20, gcFcst: 10000, hoursSched: 1500, laborTargetOrg: 0.20, rate: 13 });
    const b = analyzeStore({ loc: 'B', salesFcst: 10000, laborPctActual: 0.40, gcFcst: 2000, hoursSched: 400, laborTargetOrg: 0.20, rate: 13 });
    const g = aggregateGroup([a, b]);
    // Σ$ = 100000*.2 + 10000*.4 = 24000 ; Σsales = 110000 → 21.8%, NOT (20+40)/2=30%.
    expect(g.laborPctActual).toBeCloseTo(24000 / 110000, 6);
    expect(g.laborPctActual).not.toBeCloseTo(0.30, 3);
    expect(g.salesFcst).toBe(110000);
    expect(g.n).toBe(2);
  });

  it('weighted TPPH = Σgc/Σhours', () => {
    const a = analyzeStore({ loc: 'A', salesFcst: 1, gcFcst: 10000, hoursSched: 1500 });
    const b = analyzeStore({ loc: 'B', salesFcst: 1, gcFcst: 2000, hoursSched: 400 });
    const g = aggregateGroup([a, b]);
    expect(g.tpph).toBeCloseTo(12000 / 1900, 6);
  });

  it('empty group → null', () => expect(aggregateGroup([])).toBeNull());
});

describe('labor-analysis — analyzeSheet buckets FL vs OK', () => {
  it('splits and subtotals by the isFL predicate', () => {
    const inputs = [
      { loc: '3708', salesFcst: 74379, laborPctActual: 0.25, gcFcst: 7443, hoursSched: 62, laborTargetOrg: 0.215, rate: 13 },
      { loc: '6178', salesFcst: 50000, laborPctActual: 0.24, gcFcst: 5000, hoursSched: 45, laborTargetOrg: 0.215, rate: 13 },
    ];
    const FL = new Set(['6178']);
    const out = analyzeSheet(inputs, loc => FL.has(loc));
    expect(out.rows).toHaveLength(2);
    expect(out.subtotals.ok.n).toBe(1);
    expect(out.subtotals.fl.n).toBe(1);
    expect(out.subtotals.grand.n).toBe(2);
    expect(out.subtotals.grand.salesFcst).toBe(124379);
  });
});

describe('labor-analysis — hours of operation', () => {
  it('hoursOpen from Excel time fractions', () => {
    // 5:00 (0.2083) to 22:00 (0.9166) = 17h
    expect(hoursOpen(0.20833333, 0.91666666)).toBeCloseTo(17, 1);
  });
  it('close at/through midnight wraps to a 24h day span', () => {
    // open 5:00, close 0 (midnight) → 19h
    expect(hoursOpen(0.20833333, 0)).toBeCloseTo(19, 1);
    // open 22:00, close 2:00 → 4h (crossed midnight)
    expect(hoursOpen(0.91666666, 0.08333333)).toBeCloseTo(4, 1);
  });
  it('fracToTime formats 12-hour clock', () => {
    expect(fracToTime(0.20833333)).toBe('5:00 AM');
    expect(fracToTime(0.91666666)).toBe('10:00 PM');
    expect(fracToTime(0.5)).toBe('12:00 PM');
    expect(fracToTime(0)).toBe('12:00 AM');
  });
  it('FLH thresholds are the sheet constants', () => {
    expect(FLH_THRESHOLDS).toEqual({ fixed10: 0.10, fixed15: 0.15, floor10: 0.10, floor15: 0.15, combined25: 0.25 });
  });
});
