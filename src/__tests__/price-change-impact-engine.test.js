// Reports redesign Phase 5 -- engine/price-change-impact.js
import { describe, it, expect } from 'vitest';
import { buildPriceChangeImpactReport } from '../engine/price-change-impact.js';

const D = (d) => new Date(2026, 9, 1 + d); // Oct 1, 2026 + d days, local time

function buildFixture() {
  const pmixRows = [];
  const laborRows = [];
  for (let i = 0; i < 28; i++) {
    const beforeChange = i < 14;
    pmixRows.push({ loc: '3708', date: D(i), item: '100', desc: 'Test Item', price: beforeChange ? 5.00 : 5.50, soldQty: 10 });
    laborRows.push({ loc: '3708', date: D(i), sales: beforeChange ? 1000 : 1200, gc: beforeChange ? 100 : 110 });
  }
  return { pmixRows, laborRows };
}

describe('buildPriceChangeImpactReport', () => {
  const ds = buildFixture();
  const range = { s: '2026-10-01', e: '2026-10-31' };

  it('returns [] when range is missing', () => {
    expect(buildPriceChangeImpactReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('finds the confirmed price-change event and compares the real 14-day before/after windows', () => {
    const rows = buildPriceChangeImpactReport(ds, { locs: ['3708'], range });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.loc).toBe('3708');
    expect(r.name).toBe('Ardmore-Broadway');
    expect(r.date).toBe('2026-10-15'); // day index 14 -> Oct 1 + 14 = Oct 15
    expect(r.itemsChanged).toBe(1);
    expect(r.meanStepPct).toBeCloseTo(10, 1); // 5.00 -> 5.50 = +10%
    expect(r.beforeSalesAvg).toBeCloseTo(1000, 1);
    expect(r.afterSalesAvg).toBeCloseTo(1200, 1);
    expect(r.salesDeltaPct).toBeCloseTo(20, 1);
    expect(r.beforeGCAvg).toBeCloseTo(100, 1);
    expect(r.afterGCAvg).toBeCloseTo(110, 1);
    expect(r.beforeDaysObserved).toBe(14);
    expect(r.afterDaysObserved).toBe(14);
  });

  it('excludes an event whose store is not in locs', () => {
    expect(buildPriceChangeImpactReport(ds, { locs: ['9999'], range })).toEqual([]);
  });

  it('excludes an event whose date falls outside the selected range', () => {
    expect(buildPriceChangeImpactReport(ds, { locs: ['3708'], range: { s: '2026-11-01', e: '2026-11-30' } })).toEqual([]);
  });

  it('includes every event with a known store when locs is empty', () => {
    const rows = buildPriceChangeImpactReport(ds, { locs: [], range });
    expect(rows).toHaveLength(1);
  });
});
