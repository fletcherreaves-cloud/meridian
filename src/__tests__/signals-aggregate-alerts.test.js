// @ts-nocheck
// views/signals.js's aggregateByStore()/alertCount() had zero test coverage despite being live
// -- they're the core of the LiveOps tab (SignalsPanel, lazy-loaded in App.js): aggregateByStore
// rolls raw qsr_daily_activity DAR rows into per-store sales-pace/DT-speed/labor%/accuracy-rate
// figures (line 1001), and alertCount thresholds those into the "Needs Attention"/critical-store
// counts driving the alert badge, sort order, and CSV/PDF export (lines 1002-1003, 1146, 2514-2526).
import { describe, it, expect } from 'vitest';
import { aggregateByStore, alertCount } from '../views/signals.js';

function row(loc, overrides = {}) {
  return {
    loc,
    dt_untilserve: 0, dt_trans_cnt: 0,
    actual_punched_hours: 0, total_needed_hours: 0,
    healthy_count: 0, unhealthy_count: 0,
    product_sales: 0, mean_sales: 0,
    ...overrides,
  };
}

describe('aggregateByStore', () => {
  it('returns [] for empty rows', () => {
    expect(aggregateByStore([])).toEqual([]);
  });

  it('sums dt/punch/need/healthy/unhealthy across multiple rows for the same store', () => {
    const rows = [
      row('0003708', { dt_untilserve: 100000, dt_trans_cnt: 5, actual_punched_hours: 10, total_needed_hours: 8, healthy_count: 9, unhealthy_count: 1 }),
      row('0003708', { dt_untilserve: 50000,  dt_trans_cnt: 5, actual_punched_hours: 5,  total_needed_hours: 4, healthy_count: 4, unhealthy_count: 0 }),
    ];
    const [s] = aggregateByStore(rows);
    expect(s.dtTime).toBe(150000);
    expect(s.dtCnt).toBe(10);
    expect(s.punched).toBe(15);
    expect(s.needed).toBe(12);
    expect(s.healthy).toBe(13);
    expect(s.unhealthy).toBe(1);
  });

  it('computes dtAvgSec as dtTime/dtCnt/1000 (ms summed -> seconds average)', () => {
    const rows = [row('0003708', { dt_untilserve: 240000, dt_trans_cnt: 10 })];
    expect(aggregateByStore(rows)[0].dtAvgSec).toBe(24);
  });

  it('computes laborPct as punched/needed*100', () => {
    const rows = [row('0003708', { actual_punched_hours: 11, total_needed_hours: 10 })];
    expect(aggregateByStore(rows)[0].laborPct).toBeCloseTo(110, 6);
  });

  it('computes accRate as healthy/(healthy+unhealthy)*100', () => {
    const rows = [row('0003708', { healthy_count: 90, unhealthy_count: 10 })];
    expect(aggregateByStore(rows)[0].accRate).toBe(90);
  });

  it('computes salesPct only from slots with product_sales > 0 (excludes future/empty hours)', () => {
    const rows = [
      row('0003708', { product_sales: 100, mean_sales: 100 }), // completed, on-pace
      row('0003708', { product_sales: 0,   mean_sales: 500 }), // not yet happened -- excluded
    ];
    const s = aggregateByStore(rows)[0];
    expect(s.salesPct).toBe(100); // 100/100*100, the empty future slot's mean_sales=500 never counted
  });

  it('null-guards salesPct/dtAvgSec/laborPct/accRate when their denominators are 0', () => {
    const s = aggregateByStore([row('0003708')])[0];
    expect(s.salesPct).toBeNull();
    expect(s.dtAvgSec).toBeNull();
    expect(s.laborPct).toBeNull();
    expect(s.accRate).toBeNull();
  });

  it('derives key by parsing the zero-padded loc to an int and back to a string', () => {
    const s = aggregateByStore([row('0003708')])[0];
    expect(s.key).toBe('3708');
  });

  it('aggregates multiple stores independently and sorts by storeName', () => {
    const rows = [row('9999999'), row('0003708')];
    const stores = aggregateByStore(rows);
    expect(stores).toHaveLength(2);
    // Neither loc is in STORE_NAMES, so storeName falls back to 'Store <key>' -- '3708' < '9999999'
    // alphabetically, confirming the sort actually ran rather than preserving insertion order.
    expect(stores.map(s => s.key)).toEqual(['3708', '9999999']);
  });
});

describe('alertCount', () => {
  it('returns 0 when every metric is null (no data)', () => {
    expect(alertCount({ salesPct: null, dtAvgSec: null, laborPct: null, accRate: null })).toBe(0);
  });

  it('returns 0 when every metric is within its healthy band', () => {
    expect(alertCount({ salesPct: 95, dtAvgSec: 180, laborPct: 100, accRate: 95 })).toBe(0);
  });

  it('counts a low salesPct (below PACE_AMB=90)', () => {
    expect(alertCount({ salesPct: 89, dtAvgSec: null, laborPct: null, accRate: null })).toBe(1);
  });

  it('counts a slow dtAvgSec (above DT_AMB=200)', () => {
    expect(alertCount({ salesPct: null, dtAvgSec: 201, laborPct: null, accRate: null })).toBe(1);
  });

  it('counts a high laborPct (above LABOR_AMB=110)', () => {
    expect(alertCount({ salesPct: null, dtAvgSec: null, laborPct: 111, accRate: null })).toBe(1);
  });

  it('counts a low accRate (below ACC_AMB=92)', () => {
    expect(alertCount({ salesPct: null, dtAvgSec: null, laborPct: null, accRate: 91 })).toBe(1);
  });

  it('counts all four simultaneously when every metric is unhealthy', () => {
    expect(alertCount({ salesPct: 50, dtAvgSec: 300, laborPct: 150, accRate: 70 })).toBe(4);
  });

  it('does not count a metric exactly at its threshold (strict comparison)', () => {
    expect(alertCount({ salesPct: 90, dtAvgSec: 200, laborPct: 110, accRate: 92 })).toBe(0);
  });
});
