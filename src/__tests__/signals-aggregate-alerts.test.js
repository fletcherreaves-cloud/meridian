// @ts-nocheck
// views/signals.js's aggregateByStore()/alertCount() had zero test coverage despite being live
// -- they're the core of the LiveOps tab (SignalsPanel, lazy-loaded in App.js): aggregateByStore
// rolls raw qsr_daily_activity DAR rows into per-store OEPE/R2P/KVS/DT-Parked%/sales-pace/labor%/
// TPPH/2nd-Side-Usage figures, and alertCount thresholds those into the "Needs Attention"/
// critical-store counts driving the alert badge, sort order, and CSV/PDF export.
//
// Dispatch 2026-11-13: the old "DT Speed" column summed dt_untilserve/dt_trans_cnt with no
// subtraction -- that is "DT TTL", not the owner-requested OEPE W/O Parked -- and "Accuracy" was
// always healthy/(healthy+unhealthy), i.e. 2nd Side Healthy Usage %, never order accuracy. Both
// are fixed here (oepeSec/accRate), and R2P/KVS/DT-Parked%/Labor%(cost)/TPPH are new columns.
// See memory/finding-signals-liveops-mislabels-2026-11-13.md.
import { describe, it, expect } from 'vitest';
import { aggregateByStore, alertCount } from '../views/signals.js';
import { DEFAULT_TARGETS } from '../constants.js';

function row(loc, overrides = {}) {
  return {
    loc,
    dt_untilserve: 0, dt_untilstore: 0, dt_heldtime: 0, dt_carsheld: 0, dt_trans_cnt: 0,
    fc_untilserve: 0, fc_untilclosedrawer: 0, fc_trans_cnt: 0,
    mfy1_untilserve: 0, mfy1_trans_cnt: 0, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
    actual_punched_hours: 0, total_needed_hours: 0,
    healthy_count: 0, unhealthy_count: 0,
    product_sales: 0, mean_sales: 0,
    prod_sales_scrubbed: 0, trans_scrubbed: 0, actual_punched_dollars: 0,
    ...overrides,
  };
}

describe('aggregateByStore', () => {
  it('returns [] for empty rows', () => {
    expect(aggregateByStore([])).toEqual([]);
  });

  it('sums every raw component across multiple rows for the same store', () => {
    const rows = [
      row('0003708', {
        dt_untilserve: 180000, dt_untilstore: 20000, dt_heldtime: 10000, dt_carsheld: 1, dt_trans_cnt: 5,
        fc_untilserve: 100000, fc_untilclosedrawer: 20000, fc_trans_cnt: 4,
        mfy1_untilserve: 40000, mfy1_trans_cnt: 4, mfy2_untilserve: 30000, mfy2_trans_cnt: 3,
        actual_punched_hours: 10, total_needed_hours: 8, healthy_count: 9, unhealthy_count: 1,
        prod_sales_scrubbed: 500, trans_scrubbed: 50, actual_punched_dollars: 100,
      }),
      row('0003708', {
        dt_untilserve: 90000, dt_untilstore: 10000, dt_heldtime: 5000, dt_carsheld: 1, dt_trans_cnt: 5,
        fc_untilserve: 50000, fc_untilclosedrawer: 10000, fc_trans_cnt: 4,
        mfy1_untilserve: 20000, mfy1_trans_cnt: 2, mfy2_untilserve: 15000, mfy2_trans_cnt: 1,
        actual_punched_hours: 5, total_needed_hours: 4, healthy_count: 4, unhealthy_count: 0,
        prod_sales_scrubbed: 250, trans_scrubbed: 25, actual_punched_dollars: 50,
      }),
    ];
    const [s] = aggregateByStore(rows);
    expect(s.dtUntilServe).toBe(270000);
    expect(s.dtUntilStore).toBe(30000);
    expect(s.dtHeldTime).toBe(15000);
    expect(s.dtCarsHeld).toBe(2);
    expect(s.dtTransCnt).toBe(10);
    expect(s.fcUntilServe).toBe(150000);
    expect(s.fcUntilClosedDrawer).toBe(30000);
    expect(s.fcTransCnt).toBe(8);
    expect(s.mfy1UntilServe).toBe(60000);
    expect(s.mfy2UntilServe).toBe(45000);
    expect(s.mfy1TransCnt).toBe(6);
    expect(s.mfy2TransCnt).toBe(4);
    expect(s.punched).toBe(15);
    expect(s.needed).toBe(12);
    expect(s.healthy).toBe(13);
    expect(s.unhealthy).toBe(1);
    expect(s.prodSalesScrubbed).toBe(750);
    expect(s.transScrubbed).toBe(75);
    expect(s.actualPunchedDollars).toBe(150);
  });

  it('computes oepeSec via the shared, reconciled formula -- sum first, divide once, parked time subtracted', () => {
    // (dt_untilserve - dt_untilstore - dt_heldtime) / dt_trans_cnt / 1000, NOT the old raw
    // dt_untilserve/dt_trans_cnt/1000 ("DT TTL") this column used to compute under the same label.
    const rows = [row('0003708', { dt_untilserve: 300000, dt_untilstore: 20000, dt_heldtime: 10000, dt_trans_cnt: 10 })];
    const s = aggregateByStore(rows)[0];
    expect(s.oepeSec).toBe(27); // (300000-20000-10000)/10/1000 = 27
    expect(s.oepeSec).not.toBe(30); // the old, wrong "DT TTL" value this bug used to produce
  });

  it('gates oepeSec on dt_untilstore > 0, matching oepeSeconds()', () => {
    const rows = [row('0003708', { dt_untilserve: 100000, dt_untilstore: 0, dt_trans_cnt: 10 })];
    expect(aggregateByStore(rows)[0].oepeSec).toBeNull();
  });

  it('computes r2pSec as (fc_untilserve - fc_untilclosedrawer) / fc_trans_cnt / 1000', () => {
    const rows = [row('0003708', { fc_untilserve: 150000, fc_untilclosedrawer: 30000, fc_trans_cnt: 10 })];
    expect(aggregateByStore(rows)[0].r2pSec).toBe(12);
  });

  it('computes kvsSec by summing both MFY stations before dividing', () => {
    const rows = [row('0003708', { mfy1_untilserve: 60000, mfy1_trans_cnt: 6, mfy2_untilserve: 40000, mfy2_trans_cnt: 4 })];
    expect(aggregateByStore(rows)[0].kvsSec).toBe(10); // (60000+40000)/(6+4)/1000
  });

  it('computes parkPct as dt_carsheld / dt_trans_cnt * 100', () => {
    const rows = [row('0003708', { dt_carsheld: 3, dt_trans_cnt: 20 })];
    expect(aggregateByStore(rows)[0].parkPct).toBe(15);
  });

  it('computes laborCostPct (cost-based) as actual_punched_dollars / prod_sales_scrubbed * 100, distinct from laborPct (staffing)', () => {
    const rows = [row('0003708', {
      actual_punched_dollars: 220, prod_sales_scrubbed: 1000,
      actual_punched_hours: 11, total_needed_hours: 10,
    })];
    const s = aggregateByStore(rows)[0];
    expect(s.laborCostPct).toBeCloseTo(22, 6);
    expect(s.laborPct).toBeCloseTo(110, 6);
    expect(s.laborCostPct).not.toBe(s.laborPct);
  });

  it('computes tpph as trans_scrubbed / punched hours', () => {
    const rows = [row('0003708', { trans_scrubbed: 56, actual_punched_hours: 10 })];
    expect(aggregateByStore(rows)[0].tpph).toBeCloseTo(5.6, 6);
  });

  it('computes accRate as healthy/(healthy+unhealthy)*100 -- 2nd Side Healthy Usage %, not order accuracy', () => {
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

  it('null-guards every ratio metric when its denominator is 0', () => {
    const s = aggregateByStore([row('0003708')])[0];
    expect(s.salesPct).toBeNull();
    expect(s.oepeSec).toBeNull();
    expect(s.r2pSec).toBeNull();
    expect(s.kvsSec).toBeNull();
    expect(s.parkPct).toBeNull();
    expect(s.laborCostPct).toBeNull();
    expect(s.tpph).toBeNull();
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
  const base = { salesPct: null, oepeSec: null, laborPct: null, accRate: null, r2pSec: null, kvsSec: null, parkPct: null, laborCostPct: null, tpph: null, key: '9999999' };

  it('returns 0 when every metric is null (no data)', () => {
    expect(alertCount(base)).toBe(0);
  });

  it('returns 0 when every metric is within its healthy band', () => {
    expect(alertCount({ ...base, salesPct: 95, oepeSec: 180, laborPct: 100, accRate: 95 })).toBe(0);
  });

  it('counts a low salesPct (below PACE_AMB=90)', () => {
    expect(alertCount({ ...base, salesPct: 89 })).toBe(1);
  });

  it('counts a slow oepeSec (above OEPE_AMB=200, no per-store target for this unknown store)', () => {
    expect(alertCount({ ...base, oepeSec: 201 })).toBe(1);
  });

  it('counts a high laborPct (above LABOR_AMB=110)', () => {
    expect(alertCount({ ...base, laborPct: 111 })).toBe(1);
  });

  it('counts a low accRate (below ACC_AMB=92)', () => {
    expect(alertCount({ ...base, accRate: 91 })).toBe(1);
  });

  it('does not count a metric exactly at its threshold (strict comparison)', () => {
    expect(alertCount({ ...base, salesPct: 90, oepeSec: 200, laborPct: 110, accRate: 92 })).toBe(0);
  });

  it('counts a real store\'s r2pSec/kvsSec against its own DEFAULT_TARGETS band, not the flat fallback', () => {
    const realLoc = Object.keys(DEFAULT_TARGETS)[0];
    const t = DEFAULT_TARGETS[realLoc];
    // Just over this store's own tR2p target -- an alert under the per-store band even though it
    // may be well under the flat OEPE_AMB=200 fallback that applies to a store with no target.
    const r2pJustOver = t.tR2p + 1;
    expect(alertCount({ ...base, key: realLoc, r2pSec: r2pJustOver })).toBe(1);
    expect(alertCount({ ...base, key: realLoc, r2pSec: t.tR2p - 5 })).toBe(0);
  });

  it('counts parkPct/laborCostPct/tpph only when worse than this store\'s own target beyond the 0.5pp tolerance', () => {
    const realLoc = Object.keys(DEFAULT_TARGETS)[0];
    const t = DEFAULT_TARGETS[realLoc];
    // tPark/tLabor are lower-is-better fractions; well above target by more than 0.5pp = alert.
    expect(alertCount({ ...base, key: realLoc, parkPct: (t.tPark + 0.05) * 100 })).toBe(1);
    expect(alertCount({ ...base, key: realLoc, parkPct: t.tPark * 100 })).toBe(0);
    expect(alertCount({ ...base, key: realLoc, laborCostPct: (t.tLabor + 0.05) * 100 })).toBe(1);
    // tTpph is higher-is-better; well below target = alert.
    expect(alertCount({ ...base, key: realLoc, tpph: t.tTpph - 1 })).toBe(1);
    expect(alertCount({ ...base, key: realLoc, tpph: t.tTpph + 1 })).toBe(0);
  });

  it('never alerts on a metric with no established target for an unknown store', () => {
    expect(alertCount({ ...base, key: '0000000', parkPct: 99, laborCostPct: 99, tpph: 0.01 })).toBe(0);
  });

  it('counts every alert simultaneously when every metric is unhealthy', () => {
    const realLoc = Object.keys(DEFAULT_TARGETS)[0];
    const t = DEFAULT_TARGETS[realLoc];
    const n = alertCount({
      salesPct: 50, oepeSec: 300, laborPct: 150, accRate: 70,
      r2pSec: t.tR2p + 100, kvsSec: t.tKvst + 100,
      parkPct: (t.tPark + 0.1) * 100, laborCostPct: (t.tLabor + 0.1) * 100, tpph: t.tTpph - 2,
      key: realLoc,
    });
    expect(n).toBe(9);
  });
});
