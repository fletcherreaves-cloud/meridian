// @ts-nocheck
// 2026-10-27 -- extracted from index.ts's inline query_daily_activity aggregation while adding
// daypart-filtered OEPE/KVS/R2P support. Imports supabase/functions/sage-chat/
// daily-activity-agg.js directly -- the same plain-JS module index.ts's tool calls. No Deno test
// infrastructure exists in this repo to boot the edge function itself, so this is the closest
// thing to the real call site. Same pattern as sage-paginate.test.js etc.
import { describe, it, expect } from 'vitest';
import { aggregateDailyActivity, DAILY_ACTIVITY_NOTE } from '../../supabase/functions/sage-chat/daily-activity-agg.js';

const STORE_NAMES = { '3708': 'Ardmore-Broadway', '32525': 'Sulphur' };

describe('daily-activity-agg -- loc normalization bug (found and fixed in this pass)', () => {
  it('resolves the real store name even though qsr_daily_activity.loc is zero-padded at the DB level', () => {
    // Confirmed live: qsr_daily_activity.loc is "0003708" on every row, but STORE_NAMES' keys
    // are unpadded ("3708"). The original inline version keyed its map by the raw padded loc and
    // never normalized before the STORE_NAMES lookup, so this always fell through to the
    // generated "Store 0003708" fallback -- reverting the parseInt normalization below makes
    // this test fail.
    const rows = [
      { loc: '0003708', dt: '2026-10-01', product_sales: 1000, proj_sales_dollars: 900, dt_untilserve: 180000, dt_trans_cnt: 1 },
    ];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    expect(result).toHaveLength(1);
    expect(result[0].loc).toBe('3708');
    expect(result[0].name).toBe('Ardmore-Broadway');
  });

  it('falls back to a generated label for a loc with no known name, still correctly unpadded', () => {
    const rows = [{ loc: '0009999', dt: '2026-10-01', product_sales: 100, dt_trans_cnt: 0 }];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    expect(result[0].loc).toBe('9999');
    expect(result[0].name).toBe('Store 9999');
  });
});

describe('daily-activity-agg -- sales/DT fields (existing behavior, unchanged)', () => {
  it('sums sales and projection, computes vs_proj_pct and dt_avg_sec exactly as before', () => {
    const rows = [
      { loc: '0003708', dt: '2026-10-01', product_sales: 10000, proj_sales_dollars: 9000, dt_untilserve: 180000, dt_trans_cnt: 1 },
      { loc: '0003708', dt: '2026-10-02', product_sales: 11000, proj_sales_dollars: 9500, dt_untilserve: 200000, dt_trans_cnt: 1 },
    ];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    expect(result[0].sales).toBe(21000);
    expect(result[0].qsr_proj).toBe(18500);
    expect(result[0].vs_proj_pct).toBeCloseTo((21000 / 18500 - 1) * 100, 1);
    expect(result[0].dt_avg_sec).toBe(190); // (180000+200000)/2/1000
    expect(result[0].days).toBe(2);
  });
});

describe('daily-activity-agg -- new OEPE/KVS/R2P fields', () => {
  it('computes oepe_avg_sec via the shared oepeSeconds() formula, matching src/utils/oepe.js exactly', () => {
    const rows = [{
      loc: '0003708', dt: '2026-10-01', product_sales: 1000, dt_trans_cnt: 10,
      dt_untilserve: 2000000, dt_untilstore: 500000, dt_heldtime: 100000,
    }];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    // oepeSeconds: ((2000000 - 500000) - 100000) / 10 / 1000 = 1400000/10/1000 = 140
    expect(result[0].oepe_avg_sec).toBe(140);
  });

  it('computes kvs_avg_sec from mfy1+mfy2 combined, matching graded-visits.js exactly', () => {
    const rows = [{
      loc: '0003708', dt: '2026-10-01', product_sales: 1000, dt_trans_cnt: 0,
      mfy1_untilserve: 300000, mfy1_trans_cnt: 5, mfy2_untilserve: 200000, mfy2_trans_cnt: 5,
    }];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    // (300000+200000) / (5+5) / 1000 = 50
    expect(result[0].kvs_avg_sec).toBe(50);
  });

  it('computes r2p_avg_sec, matching metric-provenance.js\'s documented formula exactly', () => {
    const rows = [{
      loc: '0003708', dt: '2026-10-01', product_sales: 1000, dt_trans_cnt: 0,
      fc_untilserve: 400000, fc_untilclosedrawer: 100000, fc_trans_cnt: 10,
    }];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    // (400000-100000)/10/1000 = 30
    expect(result[0].r2p_avg_sec).toBe(30);
  });

  it('returns null (not zero) for oepe/kvs/r2p when a store has no qualifying transactions', () => {
    const rows = [{ loc: '0003708', dt: '2026-10-01', product_sales: 1000, dt_trans_cnt: 0 }];
    const result = aggregateDailyActivity(rows, STORE_NAMES);
    expect(result[0].oepe_avg_sec).toBeNull();
    expect(result[0].kvs_avg_sec).toBeNull();
    expect(result[0].r2p_avg_sec).toBeNull();
  });
});

describe('daily-activity-agg -- DAILY_ACTIVITY_NOTE', () => {
  it('tells the model to prefer oepe_avg_sec over dt_avg_sec and warns daypart scoping is not whole-day', () => {
    expect(DAILY_ACTIVITY_NOTE).toMatch(/prefer this over dt_avg_sec/i);
    expect(DAILY_ACTIVITY_NOTE).toMatch(/not the whole business day/i);
  });
});
