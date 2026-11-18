// @ts-nocheck
// Owner request, 2026-11-17: "give a report that shows specifically DT OEPE w/o parked for the
// following periods for each location: MTD, LM, Last 30 Days, Last 45 Days, Last 90 days and
// YTD." METRIC_SOURCES.oepe already IS that w/o-parked formula (src/utils/oepe.js's
// oepeSeconds() excludes held/parked time) — this file only tests the 6 new period windows and
// that computeDtOepeReport reads a true Sum/Sum, not a mean-of-daily, per the standing ROLLUP
// CAVEAT rule.
import { describe, it, expect } from 'vitest';
import { dtOepeReportWindows, computeDtOepeReport, DT_OEPE_WINDOW_COLS } from '../engine/dt-oepe-report.js';

const _days = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

describe('dtOepeReportWindows', () => {
  const asOf = new Date(2026, 10, 17); // Nov 17, 2026 (JS months are 0-based)
  const w = dtOepeReportWindows(asOf);

  it('MTD spans the 1st of asOf\'s month through asOf', () => {
    expect(w.mtd.s).toEqual(new Date(2026, 10, 1));
    expect(w.mtd.e).toBe(asOf);
  });

  it('LM is the full previous calendar month, not a rolling 30 days', () => {
    expect(w.lm.s).toEqual(new Date(2026, 9, 1));
    expect(w.lm.e).toEqual(new Date(2026, 9, 31));
  });

  it('Last 30/45/90 Days are exactly N calendar days, inclusive of asOf', () => {
    expect(_days(w.last30.s, w.last30.e)).toBe(30);
    expect(_days(w.last45.s, w.last45.e)).toBe(45);
    expect(_days(w.last90.s, w.last90.e)).toBe(90);
    expect(w.last30.e).toBe(asOf);
    expect(w.last45.e).toBe(asOf);
    expect(w.last90.e).toBe(asOf);
  });

  it('YTD spans Jan 1 of asOf\'s year through asOf', () => {
    expect(w.ytd.s).toEqual(new Date(2026, 0, 1));
    expect(w.ytd.e).toBe(asOf);
  });

  it('DT_OEPE_WINDOW_COLS names exactly the 6 periods the owner asked for, in order', () => {
    expect(DT_OEPE_WINDOW_COLS.map(c => c.key)).toEqual(['mtd', 'lm', 'last30', 'last45', 'last90', 'ytd']);
  });
});

describe('computeDtOepeReport', () => {
  const asOf = new Date(2026, 10, 17);

  it('computes a true Σnum/Σden DT OEPE for MTD, not an average of daily per-transaction rates', () => {
    const ds = { qsrActSummaryRows: [
      // Low-volume day: small legs, HIGH per-transaction rate (200s/car).
      { loc: '1', date: new Date(2026, 10, 1), _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 },
      // High-volume day: much larger legs, LOW per-transaction rate (50s/car).
      { loc: '1', date: new Date(2026, 10, 10), _dtTotal: 50000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1000 },
    ] };
    const rows = computeDtOepeReport(ds, ['1'], asOf);
    expect(rows).toHaveLength(1);
    const sumSum = (20000000 + 50000000) / (100 + 1000) / 1000; // ≈ 63.6s
    const meanOfDaily = (200 + 50) / 2; // 125s -- would be wrong, volume-blind
    expect(rows[0].mtd).toBeCloseTo(sumSum, 3);
    expect(rows[0].mtd).not.toBeCloseTo(meanOfDaily, 3);
  });

  it('a store with no oepe-resolvable rows in a window returns null, not zero', () => {
    const ds = { qsrActSummaryRows: [] };
    const rows = computeDtOepeReport(ds, ['9'], asOf);
    expect(rows[0].loc).toBe('9');
    for (const col of DT_OEPE_WINDOW_COLS) expect(rows[0][col.key]).toBeNull();
  });

  it('a row outside every window (two years prior) never leaks into YTD', () => {
    const ds = { qsrActSummaryRows: [
      { loc: '1', date: new Date(2024, 5, 1), _dtTotal: 99999999, _dtStore: 0, _dtHeldTime: 0, _dtCars: 1 },
    ] };
    const rows = computeDtOepeReport(ds, ['1'], asOf);
    expect(rows[0].ytd).toBeNull();
  });

  it('returns one row per requested loc, in the order given', () => {
    const ds = { qsrActSummaryRows: [] };
    const rows = computeDtOepeReport(ds, ['3708', '5183'], asOf);
    expect(rows.map(r => r.loc)).toEqual(['3708', '5183']);
  });
});
