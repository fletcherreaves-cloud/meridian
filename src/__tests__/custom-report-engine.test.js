// Reports redesign Phase 4 -- engine/custom-report.js. Exercises the real resolver
// (metricValueForRange, same primitive Loss Prevention Summary's buildLossPreventionReport
// already uses -- not a second resolution path), not a mock of it.
import { describe, it, expect } from 'vitest';
import { METRIC_CATEGORIES } from '../engine/signal-registry.js';
import { customReportCatalog, buildCustomReportRows, customReportMetricMeta } from '../engine/custom-report.js';

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

describe('customReportMetricMeta', () => {
  it('returns the real label + unit for a known metric', () => {
    expect(customReportMetricMeta('schedGap')).toEqual({ label: 'Schedule Gap vs Ideal (hrs)', unit: 'hrs' });
  });

  it('falls back to the raw key as the label, with no unit, for an unknown metric', () => {
    expect(customReportMetricMeta('__no_such_metric')).toEqual({ label: '__no_such_metric', unit: null });
  });
});
