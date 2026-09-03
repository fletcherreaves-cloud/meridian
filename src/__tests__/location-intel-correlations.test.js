// @ts-nocheck
// features/location-intel.js's correlation helpers (pearsonR, liDOWPatterns, liOEPECorr,
// liWeatherCorr, liOpsCorr, liOppCost, liLaborCoverage, liAvgCheckTrend) are the real statistics
// behind Location Intelligence's roadmap, reachable live only through the exported
// liComputeAll/liBuildRoadmap. The only existing tests that call them (dispatch-208-tab-digest,
// dispatch-200-location-intel-embedded) pass empty/tiny fixtures where every branch short-
// circuits to null -- "no correlation-worthy opsRows/laborRows supplied, so a real $0/'no
// opportunities' reading is the CORRECT engine output" (dispatch-208's own comment). None of the
// actual math has ever run in a test. Exported each helper directly so it can be driven with a
// real, correlation-worthy fixture and checked against hand-computed values.
import { describe, it, expect } from 'vitest';
import {
  pearsonR, liDOWPatterns, liOEPECorr, liWeatherCorr, liOpsCorr, liOppCost, liLaborCoverage, liAvgCheckTrend,
} from '../features/location-intel.js';

const LOC = '99999';
const d = (y, m, day) => new Date(y, m - 1, day);

describe('pearsonR', () => {
  it('returns null when n < 5', () => {
    expect(pearsonR([1, 2, 3], [1, 2, 3])).toBeNull();
  });

  it('returns null when arrays have mismatched lengths', () => {
    expect(pearsonR([1, 2, 3, 4, 5], [1, 2, 3, 4])).toBeNull();
  });

  it('returns 1 for a perfect positive linear relationship', () => {
    expect(pearsonR([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBe(1);
  });

  it('returns -1 for a perfect negative linear relationship', () => {
    expect(pearsonR([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBe(-1);
  });

  it('returns null when x has zero variance (den === 0)', () => {
    expect(pearsonR([5, 5, 5, 5, 5], [1, 2, 3, 4, 5])).toBeNull();
  });
});

describe('liDOWPatterns', () => {
  it('averages sales per day-of-week, requiring >2 samples per bin (else null)', () => {
    // Three dates 7 days apart share the same day-of-week -- a real 3-sample bin.
    const manyDow = d(2026, 1, 5).getDay();
    const fewDow = d(2026, 1, 6).getDay(); // one day later -- a different bin, single sample
    const ds = {
      laborRows: [
        { loc: LOC, date: d(2026, 1, 5), sales: 100 },
        { loc: LOC, date: d(2026, 1, 12), sales: 200 },
        { loc: LOC, date: d(2026, 1, 19), sales: 300 },
        { loc: LOC, date: d(2026, 1, 6), sales: 500 },
        { loc: 'other', date: d(2026, 1, 5), sales: 9999 }, // different loc -- excluded
      ],
    };
    const out = liDOWPatterns(LOC, ds);
    expect(out.avgs[manyDow]).toBeCloseTo(200, 6);
    expect(out.avgs[fewDow]).toBeNull(); // only 1 sample, needs >2
    expect(out.counts[manyDow]).toBe(3);
    expect(out.counts[fewDow]).toBe(1);
    expect(out.grand).toBeCloseTo(200, 6); // only one valid bin
  });

  it('returns null when no bin has any sales rows', () => {
    expect(liDOWPatterns(LOC, { laborRows: [] })).toBeNull();
  });
});

describe('liOEPECorr', () => {
  it('splits days above vs at/below the OEPE target and computes the sales % impact', () => {
    const laborRows = [], opsRows = [];
    for (let i = 0; i < 6; i++) {
      const date = d(2026, 1, i + 1);
      opsRows.push({ loc: LOC, date, oepe: 300 }); // above default 240s target
      laborRows.push({ loc: LOC, date, sales: 800 });
    }
    for (let i = 0; i < 6; i++) {
      const date = d(2026, 1, i + 10);
      opsRows.push({ loc: LOC, date, oepe: 200 }); // at/below target
      laborRows.push({ loc: LOC, date, sales: 1000 });
    }
    const out = liOEPECorr(LOC, { laborRows, opsRows }, {});
    expect(out.n).toBe(12);
    expect(out.oepeTgt).toBe(240); // DEFAULT_TARGETS has no entry for this fake loc -- falls back to 240
    expect(out.above).toBe(6);
    expect(out.at).toBe(6);
    expect(out.avgAbove).toBeCloseTo(800, 6);
    expect(out.avgAt).toBeCloseTo(1000, 6);
    expect(out.pct).toBeCloseTo(-0.2, 6); // (800-1000)/1000
    expect(out.r).toBe(-1); // two-cluster data, exact linear separation
  });

  it('returns null with fewer than 10 matched pairs', () => {
    const laborRows = [{ loc: LOC, date: d(2026, 1, 1), sales: 800 }];
    const opsRows = [{ loc: LOC, date: d(2026, 1, 1), oepe: 300 }];
    expect(liOEPECorr(LOC, { laborRows, opsRows }, {})).toBeNull();
  });
});

describe('liWeatherCorr', () => {
  it('computes rain-vs-dry sales impact from 24 days, half rainy half dry', () => {
    const laborRows = [];
    const wxByDate = {};
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 1, i + 1);
      laborRows.push({ loc: LOC, date, sales: 700 });
      wxByDate[`2026-01-${String(i + 1).padStart(2, '0')}`] = { rain: 0.5, tmax: 70 };
    }
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 2, i + 1);
      laborRows.push({ loc: LOC, date, sales: 1000 });
      wxByDate[`2026-02-${String(i + 1).padStart(2, '0')}`] = { rain: 0, tmax: 70 };
    }
    const out = liWeatherCorr(LOC, { laborRows, wxByDate });
    expect(out.n).toBe(24);
    expect(out.rainDays).toBe(12);
    expect(out.dryDays).toBe(12);
    expect(out.avgRain).toBeCloseTo(700, 6);
    expect(out.avgDry).toBeCloseTo(1000, 6);
    expect(out.rainImpact).toBeCloseTo(-0.3, 6); // (700-1000)/1000
    const rainVar = out.variables.find(v => v.key === 'rain');
    expect(rainVar).toBeTruthy();
    expect(rainVar.impact).toBeCloseTo(-0.3, 6);
  });

  it('returns null with no wxByDate at all', () => {
    expect(liWeatherCorr(LOC, { laborRows: [], wxByDate: null })).toBeNull();
  });

  it('returns null with fewer than 20 matched pairs', () => {
    const wxByDate = { '2026-01-01': { rain: 0, tmax: 70 } };
    const laborRows = [{ loc: LOC, date: d(2026, 1, 1), sales: 700 }];
    expect(liWeatherCorr(LOC, { laborRows, wxByDate })).toBeNull();
  });
});

describe('liOpsCorr', () => {
  it('computes TPPH impact (higher TPPH -> higher sales) via median split', () => {
    const laborRows = [], ctrlRows = [];
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 1, i + 1);
      ctrlRows.push({ loc: LOC, date, tpph: 15 });
      laborRows.push({ loc: LOC, date, sales: 800 });
    }
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 2, i + 1);
      ctrlRows.push({ loc: LOC, date, tpph: 25 });
      laborRows.push({ loc: LOC, date, sales: 1000 });
    }
    const out = liOpsCorr(LOC, { laborRows, ctrlRows, opsRows: [] });
    const tpph = out.variables.find(v => v.key === 'tpph');
    expect(tpph).toBeTruthy();
    expect(tpph.n).toBe(24);
    expect(tpph.impact).toBeCloseTo(0.25, 6); // (1000-800)/800
    expect(tpph.positiveIsGood).toBe(true);
  });

  it('computes DT Parked % impact (higher parked -> lower sales) via median split', () => {
    const laborRows = [], opsRows = [];
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 1, i + 1);
      opsRows.push({ loc: LOC, date, dtParked: 5 });
      laborRows.push({ loc: LOC, date, sales: 1000 });
    }
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 2, i + 1);
      opsRows.push({ loc: LOC, date, dtParked: 20 });
      laborRows.push({ loc: LOC, date, sales: 700 });
    }
    const out = liOpsCorr(LOC, { laborRows, ctrlRows: [], opsRows });
    const park = out.variables.find(v => v.key === 'dtParked');
    expect(park).toBeTruthy();
    expect(park.n).toBe(24);
    expect(park.impact).toBeCloseTo(-0.3, 6); // (700-1000)/1000
    expect(park.invert).toBe(true);
  });

  it('computes OEPE-without-parked impact (higher OEPE -> lower sales) via median split', () => {
    const laborRows = [], opsRows = [];
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 1, i + 1);
      opsRows.push({ loc: LOC, date, oepeWoP: 150 });
      laborRows.push({ loc: LOC, date, sales: 1000 });
    }
    for (let i = 0; i < 12; i++) {
      const date = d(2026, 2, i + 1);
      opsRows.push({ loc: LOC, date, oepeWoP: 300 });
      laborRows.push({ loc: LOC, date, sales: 700 });
    }
    const out = liOpsCorr(LOC, { laborRows, ctrlRows: [], opsRows });
    const oepe = out.variables.find(v => v.key === 'oepe');
    expect(oepe).toBeTruthy();
    expect(oepe.n).toBe(24);
    expect(oepe.impact).toBeCloseTo(-0.3, 6);
  });

  it('returns null when no metric clears its 20-pair floor', () => {
    const laborRows = [{ loc: LOC, date: d(2026, 1, 1), sales: 1000 }];
    const ctrlRows = [{ loc: LOC, date: d(2026, 1, 1), tpph: 15 }];
    expect(liOpsCorr(LOC, { laborRows, ctrlRows, opsRows: [] })).toBeNull();
  });
});

describe('liOppCost', () => {
  it('sums opportunity cost dollars and annualizes the daily average', () => {
    const laborRows = Array.from({ length: 5 }, (_, i) => ({ loc: LOC, date: d(2026, 1, i + 1), sales: 1000, oppCostDollar: 100 }));
    const out = liOppCost(LOC, { laborRows });
    expect(out.rows).toBe(5);
    expect(out.totalOpp).toBeCloseTo(500, 6);
    expect(out.totalSales).toBeCloseTo(5000, 6);
    expect(out.annualized).toBeCloseTo(36500, 6); // 500/5*365
    expect(out.pctRev).toBeCloseTo(0.1, 6);
  });

  it('returns null with fewer than 5 qualifying rows', () => {
    const laborRows = [{ loc: LOC, date: d(2026, 1, 1), sales: 1000, oppCostDollar: 100 }];
    expect(liOppCost(LOC, { laborRows })).toBeNull();
  });
});

describe('liLaborCoverage', () => {
  it('splits under-staffed (actVsNeed < -1) vs adequately-staffed days and computes the sales impact', () => {
    const laborRows = [];
    for (let i = 0; i < 6; i++) laborRows.push({ loc: LOC, date: d(2026, 1, i + 1), sales: 700, actVsNeed: -2 });
    for (let i = 0; i < 6; i++) laborRows.push({ loc: LOC, date: d(2026, 2, i + 1), sales: 1000, actVsNeed: 0.5 });
    const out = liLaborCoverage(LOC, { laborRows });
    expect(out.rows).toBe(12);
    expect(out.pctUnder).toBeCloseTo(0.5, 6);
    expect(out.avgUnder).toBeCloseTo(700, 6);
    expect(out.avgOk).toBeCloseTo(1000, 6);
    expect(out.impact).toBeCloseTo(-0.3, 6);
  });

  it('excludes rows with actVsNeed exactly 0 or null, and returns null under the 10-row floor', () => {
    const laborRows = [
      { loc: LOC, date: d(2026, 1, 1), sales: 700, actVsNeed: 0 },
      { loc: LOC, date: d(2026, 1, 2), sales: 700, actVsNeed: null },
    ];
    expect(liLaborCoverage(LOC, { laborRows })).toBeNull();
  });
});

describe('liAvgCheckTrend', () => {
  it('computes recent-14-vs-first-14 avgCheck trend and its correlation with guest counts', () => {
    const laborRows = Array.from({ length: 20 }, (_, i) => ({
      loc: LOC, date: d(2026, 1, i + 1), sales: 1000, avgCheck: 10 + i, gc: 100 + i,
    }));
    const out = liAvgCheckTrend(LOC, { laborRows });
    expect(out.rows).toBe(20);
    expect(out.r).toBe(1); // avgCheck and gc both climb in lockstep -- perfect positive correlation
    // recent = last 14 (avgCheck 16..29), older = first 14 (avgCheck 10..23)
    expect(out.recentAvg).toBeCloseTo(22.5, 6);
    expect(out.olderAvg).toBeCloseTo(16.5, 6);
    expect(out.trend).toBeCloseTo((22.5 - 16.5) / 16.5, 6);
  });

  it('returns null with fewer than 10 qualifying rows', () => {
    const laborRows = [{ loc: LOC, date: d(2026, 1, 1), sales: 1000, avgCheck: 10, gc: 100 }];
    expect(liAvgCheckTrend(LOC, { laborRows })).toBeNull();
  });
});
