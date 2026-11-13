// @ts-nocheck
// Task #79 Phase 1 — Location Dossier engine (src/engine/location-dossier.js).
import { describe, it, expect } from 'vitest';
import { dossierWindows, buildFactualGrid, dossierSparklineSeries, topFindings, dossierStoreContext, DOSSIER_METRICS } from '../engine/location-dossier.js';

describe('dossierWindows', () => {
  it('returns 5 fixed windows in order: current, 28d, lm, l3m, ytd', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    expect(windows.map(w => w.id)).toEqual(['current', '28d', 'lm', 'l3m', 'ytd']);
  });

  it('28-Day window spans exactly 28 days ending on the last closed business day', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const win28 = windows.find(w => w.id === '28d');
    const days = (new Date(win28.e) - new Date(win28.s)) / 86400000 + 1;
    expect(days).toBe(28);
  });

  it('Last Month is the most recently completed full calendar month', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const lm = windows.find(w => w.id === 'lm');
    expect(lm.s).toBe('2026-10-01');
    expect(lm.e).toBe('2026-10-31');
  });

  it('L3M spans the 3 most recently completed calendar months', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const l3m = windows.find(w => w.id === 'l3m');
    expect(l3m.s).toBe('2026-08-01');
    expect(l3m.e).toBe('2026-10-31');
  });

  it('YTD starts Jan 1 of the current year', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const ytd = windows.find(w => w.id === 'ytd');
    expect(ytd.s).toBe('2026-01-01');
  });
});

describe('buildFactualGrid', () => {
  it('returns one row per DOSSIER_METRICS entry, with a value per window', () => {
    const ds = {
      qsrActSummaryRows: [
        { loc: '3708', date: '2026-11-01', sales: 1000, gc: 100, tpph: 5.5 },
        { loc: '3708', date: '2026-11-02', sales: 1200, gc: 110, tpph: 5.8 },
      ],
    };
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const grid = buildFactualGrid(ds, '3708', windows);
    expect(grid).toHaveLength(DOSSIER_METRICS.length);
    expect(grid[0].key).toBe('sales');
    expect(Object.keys(grid[0].values)).toEqual(windows.map(w => w.id));
  });

  it('a metric with no resolvable data for a window reads null, not a guessed number', () => {
    const ds = {};
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const grid = buildFactualGrid(ds, '9999', windows);
    for (const row of grid) {
      for (const wid of windows.map(w => w.id)) expect(row.values[wid]).toBeNull();
    }
  });
});

describe('topFindings', () => {
  it('ranks crit before watch before ok, and slices to the top N', () => {
    const findings = [
      { t: 'ok', m: 'fine 1' }, { t: 'crit', m: 'urgent' }, { t: 'watch', m: 'watch 1' },
      { t: 'ok', m: 'fine 2' }, { t: 'watch', m: 'watch 2' },
    ];
    const { headline, rest } = topFindings(findings, 3);
    expect(headline.map(f => f.t)).toEqual(['crit', 'watch', 'watch']);
    expect(rest).toHaveLength(2);
  });

  it('empty findings -> empty headline, empty rest', () => {
    const { headline, rest } = topFindings([]);
    expect(headline).toEqual([]);
    expect(rest).toEqual([]);
  });
});

// Phase 1.5 fix (owner-reported, 2026-11-13, screenshots): the SAME "Prime Cost %" (now
// labeled "Labor + FOB %") read "–" for every store, every window, not a data gap. Root cause:
// this file used to route it through metricSumRatio (agg:'ratio'), but metric-source.js's own
// primeCostPct entry has no `derive.kind:'ratio'` (it sums two ALREADY-resolved ratios, laborPct
// + fobPct, not a numerator/denominator pair of its own) -- metricSumRatio bails to null the
// moment `derive.kind !== 'ratio'`. Fixed to `agg:'avg'`, matching metric-source.js's own
// documented contract for this exact metric.
describe('primeCostPct ("Labor + FOB %") resolves instead of always reading null (Phase 1.5)', () => {
  it('DOSSIER_METRICS routes primeCostPct through agg:\'avg\', not \'ratio\'', () => {
    const spec = DOSSIER_METRICS.find(m => m.key === 'primeCostPct');
    expect(spec.agg).toBe('avg');
    expect(spec.label).toBe('Labor + FOB %');
  });

  it('resolves a real number from real laborPct + qsrFobRows data, not null', () => {
    const ds = {
      laborRows: [
        { loc: '3708', date: '2026-10-20', laborPct: 0.25 },
        { loc: '3708', date: '2026-10-21', laborPct: 0.25 },
      ],
      qsrFobRows: [
        { loc: '0003708', date: '2026-10-20', compWasteAmt: 10, rawWasteAmt: 5, condimentsAmt: 3, empMgrMealsAmt: 2, statVarianceAmt: 0, unexplainedAmt: 0, prodSalesAmt: 1000 },
        { loc: '0003708', date: '2026-10-21', compWasteAmt: 10, rawWasteAmt: 5, condimentsAmt: 3, empMgrMealsAmt: 2, statVarianceAmt: 0, unexplainedAmt: 0, prodSalesAmt: 1000 },
      ],
    };
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const grid = buildFactualGrid(ds, '3708', windows);
    const row = grid.find(g => g.key === 'primeCostPct');
    // laborPct 0.25 + fobPct (10+5+3+2+0+0)/1000=0.02 = 0.27, for the L3M window which covers Oct.
    expect(row.values.l3m).toBeCloseTo(0.27, 4);
    expect(row.values.l3m).not.toBeNull();
  });
});

describe('dossierSparklineSeries', () => {
  it('returns an ascending, gap-free {date,value} series for a resolvable metric', () => {
    const ds = {
      qsrActSummaryRows: [
        { loc: '3708', date: '2026-11-10', sales: 1000 },
        { loc: '3708', date: '2026-11-11', sales: 1100 },
        { loc: '3708', date: '2026-11-12', sales: 1200 },
      ],
    };
    const spec = DOSSIER_METRICS.find(m => m.key === 'sales');
    const series = dossierSparklineSeries(ds, '3708', spec, 10);
    expect(series.length).toBeGreaterThan(0);
    expect(series.every(p => p.value != null)).toBe(true);
    const dates = series.map(p => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns an empty array, not a crash, when nothing resolves', () => {
    const spec = DOSSIER_METRICS.find(m => m.key === 'sales');
    expect(dossierSparklineSeries({}, '9999', spec, 10)).toEqual([]);
  });
});

describe('dossierStoreContext', () => {
  it('returns the real STORE_KB entry for a known store', () => {
    const ctx = dossierStoreContext('3708');
    expect(ctx).toBeTruthy();
    expect(ctx.notes).toContain('Ardmore-Broadway');
  });

  it('returns null for an unknown loc', () => {
    expect(dossierStoreContext('0000000')).toBeNull();
  });
});
