// Reports redesign Phase 4 -- engine/custom-report.js. Exercises the real resolver
// (metricValueForRange, same primitive Loss Prevention Summary's buildLossPreventionReport
// already uses -- not a second resolution path), not a mock of it.
import { describe, it, expect } from 'vitest';
import { METRIC_CATEGORIES } from '../engine/signal-registry.js';
import { customReportCatalog, buildCustomReportRows, customReportMetricMeta, splitRangeByGranularity } from '../engine/custom-report.js';

describe('customReportCatalog', () => {
  it('only offers metrics that support a daily (range-reportable) granularity', () => {
    const cat = customReportCatalog(() => true);
    // salesVsLY (sales category) is granularity:['monthly'] only -- metricRowsForRange always
    // resolves daily under the hood, so a monthly-only metric has nothing to return through a
    // date-range report and must not appear in the picker.
    const sales = cat.find(c => c.key === 'sales');
    expect(sales.metrics.some(m => m.key === 'salesVsLY')).toBe(false);
    expect(sales.metrics.some(m => m.key === 'sales')).toBe(true);
  });

  it('drops a category entirely once every one of its metrics is filtered out', () => {
    const cat = customReportCatalog(() => true);
    // Every category in the real catalog has at least one daily metric today, so this is really
    // asserting the .filter(cat => cat.metrics.length) line has no empty-category leftovers.
    expect(cat.every(c => c.metrics.length > 0)).toBe(true);
  });

  it('hides a metric gated behind a permission the caller lacks (forward-looking filter, owner decision 2026-10-15)', () => {
    // No real metric in the catalog sets `perm` today -- inject one temporarily to prove the
    // mechanism itself works, exactly the scenario the owner's ask ("must hide any
    // payroll.view-gated metric... from a builder who lacks that permission") describes for
    // the day one actually exists.
    const fakeCat = {
      key: '__test_gated', label: 'Test Gated', color: '#000',
      metrics: [{ key: '__testGatedMetric', label: 'Gated Metric', source: 'x', field: 'y', granularity: ['daily'], perm: 'payroll.view' }],
    };
    METRIC_CATEGORIES.push(fakeCat);
    try {
      expect(customReportCatalog(() => false).some(c => c.key === '__test_gated')).toBe(false);
      expect(customReportCatalog((p) => p === 'payroll.view').some(c => c.key === '__test_gated')).toBe(true);
      // No `can` passed at all (undefined) must also deny, not throw or fall through to showing it.
      expect(customReportCatalog(undefined).some(c => c.key === '__test_gated')).toBe(false);
    } finally {
      METRIC_CATEGORIES.pop();
    }
  });

  it('never filters a metric that sets no perm, regardless of what `can` returns', () => {
    const cat = customReportCatalog(() => false);
    expect(cat.some(c => c.metrics.some(m => m.key === 'sales'))).toBe(true);
  });
});

describe('buildCustomReportRows', () => {
  const ds = {
    schedRows: [
      { loc: '3708', date: new Date(2026, 9, 1), schVsIdealDiff: 2 },
      { loc: '3708', date: new Date(2026, 9, 2), schVsIdealDiff: 4 },
      { loc: '5183', date: new Date(2026, 9, 1), schVsIdealDiff: -1 },
    ],
    storeIds: ['3708', '5183'],
  };
  const range = { s: '2026-10-01', e: '2026-10-02' };

  it('returns [] when range or metricKeys is missing', () => {
    expect(buildCustomReportRows(ds, { locs: ['3708'], range: null, metricKeys: ['schedGap'] })).toEqual([]);
    expect(buildCustomReportRows(ds, { locs: ['3708'], range, metricKeys: [] })).toEqual([]);
    expect(buildCustomReportRows(ds, { locs: ['3708'], range: { s: '2026-10-01' }, metricKeys: ['schedGap'] })).toEqual([]);
  });

  it('resolves a real metric per store over the range via metricValueForRange, with store names attached', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708', '5183'], range, metricKeys: ['schedGap'] });
    expect(rows).toHaveLength(2);
    const r3708 = rows.find(r => r.loc === '3708');
    expect(r3708.name).toBe('Ardmore-Broadway');
    expect(r3708.schedGap).toBe(3); // mean of 2 and 4 -- schedGap has no aggregate:'sum'
    const r5183 = rows.find(r => r.loc === '5183');
    expect(r5183.schedGap).toBe(-1);
  });

  it('falls back to ds.storeIds when no locs are given', () => {
    const rows = buildCustomReportRows(ds, { locs: [], range, metricKeys: ['schedGap'] });
    expect(rows.map(r => r.loc).sort()).toEqual(['3708', '5183']);
  });

  it('falls back to the raw loc as the display name when STORE_NAMES has no entry', () => {
    const rows = buildCustomReportRows(ds, { locs: ['99999'], range, metricKeys: ['schedGap'] });
    expect(rows[0]).toMatchObject({ loc: '99999', name: '99999' });
  });

  it('skips a stale/renamed metric key instead of throwing -- degrades to a missing column', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708'], range, metricKeys: ['schedGap', '__no_such_metric'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('schedGap');
    expect(rows[0]).not.toHaveProperty('__no_such_metric');
  });

  it('reads null (store has no rows in range) as a real missing value, not a thrown error or 0', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708'], range: { s: '2020-01-01', e: '2020-01-02' }, metricKeys: ['schedGap'] });
    expect(rows[0].schedGap).toBeNull();
  });
});

describe('splitRangeByGranularity (owner ask 2026-10-17: "view as" a picked window)', () => {
  it('returns a single whole-range period for "range" (the original, ungrouped behavior)', () => {
    expect(splitRangeByGranularity('2026-10-01', '2026-10-28', 'range')).toEqual([{ s: '2026-10-01', e: '2026-10-28' }]);
  });

  it('returns a single whole-range period for any unrecognized value, not an empty/thrown result', () => {
    expect(splitRangeByGranularity('2026-10-01', '2026-10-28', undefined)).toEqual([{ s: '2026-10-01', e: '2026-10-28' }]);
    expect(splitRangeByGranularity('2026-10-01', '2026-10-28', 'bogus')).toEqual([{ s: '2026-10-01', e: '2026-10-28' }]);
  });

  it('"daily" returns one period per calendar day, inclusive of both ends', () => {
    const periods = splitRangeByGranularity('2026-10-01', '2026-10-03', 'daily');
    expect(periods).toEqual([
      { s: '2026-10-01', e: '2026-10-01' },
      { s: '2026-10-02', e: '2026-10-02' },
      { s: '2026-10-03', e: '2026-10-03' },
    ]);
  });

  it('"weekly" clips the first and last periods to the requested range, not the full calendar week', () => {
    // A 28-day range starting mid-week must not pull in days before `s` or after `e`.
    const periods = splitRangeByGranularity('2026-10-01', '2026-10-28', 'weekly');
    expect(periods[0].s).toBe('2026-10-01'); // first period starts exactly at the picked start
    expect(periods[periods.length - 1].e).toBe('2026-10-28'); // last period ends exactly at the picked end
    // Every period must be a real, ordered sub-range inside [s, e].
    for (const p of periods) {
      expect(p.s <= p.e).toBe(true);
      expect(p.s >= '2026-10-01').toBe(true);
      expect(p.e <= '2026-10-28').toBe(true);
    }
  });

  it('"monthly" clips to the requested range and produces one period per calendar month touched', () => {
    const periods = splitRangeByGranularity('2026-09-20', '2026-11-05', 'monthly');
    expect(periods).toHaveLength(3); // Sep (tail), Oct (full), Nov (head)
    expect(periods[0]).toEqual({ s: '2026-09-20', e: '2026-09-30' });
    expect(periods[1]).toEqual({ s: '2026-10-01', e: '2026-10-31' });
    expect(periods[2]).toEqual({ s: '2026-11-01', e: '2026-11-05' });
  });

  it('returns [] when either boundary is missing', () => {
    expect(splitRangeByGranularity(null, '2026-10-28', 'daily')).toEqual([]);
    expect(splitRangeByGranularity('2026-10-01', null, 'daily')).toEqual([]);
  });
});

describe('buildCustomReportRows with groupBy (owner ask 2026-10-17)', () => {
  const ds = {
    schedRows: [
      { loc: '3708', date: new Date(2026, 9, 1), schVsIdealDiff: 2 },
      { loc: '3708', date: new Date(2026, 9, 2), schVsIdealDiff: 4 },
    ],
    storeIds: ['3708'],
  };
  const range = { s: '2026-10-01', e: '2026-10-02' };

  it('defaults to groupBy "range" -- one row per store, no period fields, identical to pre-existing behavior', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708'], range, metricKeys: ['schedGap'] });
    expect(rows).toEqual([{ loc: '3708', name: 'Ardmore-Broadway', schedGap: 3 }]);
  });

  it('groupBy "daily" returns one row per store PER DAY, each carrying periodStart/periodEnd', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708'], range, metricKeys: ['schedGap'], groupBy: 'daily' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ loc: '3708', periodStart: '2026-10-01', periodEnd: '2026-10-01', schedGap: 2 });
    expect(rows[1]).toMatchObject({ loc: '3708', periodStart: '2026-10-02', periodEnd: '2026-10-02', schedGap: 4 });
  });

  it('a stale/renamed metric key is still skipped per row under grouping, not thrown on', () => {
    const rows = buildCustomReportRows(ds, { locs: ['3708'], range, metricKeys: ['schedGap', '__no_such_metric'], groupBy: 'daily' });
    expect(rows.every(r => !('__no_such_metric' in r))).toBe(true);
  });
});

describe('customReportMetricMeta', () => {
  it('returns the real label + unit for a known metric', () => {
    expect(customReportMetricMeta('schedGap')).toEqual({ label: 'Schedule Gap vs Ideal (hrs)', unit: 'hrs' });
  });

  it('falls back to the raw key as the label, with no unit, for an unknown metric', () => {
    expect(customReportMetricMeta('__no_such_metric')).toEqual({ label: '__no_such_metric', unit: null });
  });
});
