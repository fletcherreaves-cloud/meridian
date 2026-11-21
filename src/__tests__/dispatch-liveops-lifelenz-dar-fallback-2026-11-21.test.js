// @ts-nocheck
// Signals LiveOps DAR fallback (2026-11-21): QSRSoft's own DAR pull has been schedule-paused
// since 2026-11-16 (compliance triage), and qsr_daily_activity/its rollup are both frozen at
// 2026-11-17 (measured live against production the same day this was found). LifeLenz DAR is
// fresh and already feeds metric-source.js's daily fallback chains, but Signals' LiveOps tab
// (App.js's refreshDar, lib/supabase.js's loadDailyActivity) queried qsr_daily_activity directly
// with no fallback, so it had been showing nothing for any recent date.
//
// lifelenzDarToDailyActivityShape (lib/supabase.js) is the honest fix: it converts LifeLenz's
// coarser hourly shape into the darRows shape LiveOpsTab/aggregateByStore (views/signals.js)
// already expect, mapping ONLY fields with a genuine equivalent and never fabricating the raw
// station components (dt_untilserve, fc_trans_cnt, healthy/unhealthy counts, needed/scheduled
// hours, mean_sales, proj_sales_dollars) LifeLenz doesn't track at all.
import { describe, it, expect } from 'vitest';
import { lifelenzDarToDailyActivityShape } from '../lib/supabase.js';
import { aggregateByStore } from '../views/signals.js';

// loadLifeLenzDar()'s own output shape (post-mapping, src/lib/supabase.js) — not the raw DB row.
function llRow(overrides = {}) {
  return {
    loc: '3708', dt: '2026-11-20', startTime: '2026-11-20T12:00:00+00:00',
    missingActuals: false, netSales: 314.79, transactions: 41,
    avgDtServiceTime: 232, avgFcServiceTime: 601, avgMfyServiceTime: 152,
    actualPunchHours: 3.9666666666666668,
    transactionsPerPunchHour: 10.336134453781511, salesPerPunchHour: 79.35882352941177,
    labourPercentageOfSales: 18.345034255641327,
    updatedAt: '2026-11-20T18:23:39.607+00:00',
    ...overrides,
  };
}

describe('lifelenzDarToDailyActivityShape: hour_slot conversion (real fixture rows, store 3708, 2026-11-20 — CST, winter)', () => {
  it('converts 10:00 UTC (4am Central, the business day\'s first hour) to hour_slot "05:00"', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ startTime: '2026-11-20T10:00:00+00:00' })]);
    expect(out.hour_slot).toBe('05:00');
  });
  it('converts 11:00 UTC (5am Central) to hour_slot "06:00"', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ startTime: '2026-11-20T11:00:00+00:00' })]);
    expect(out.hour_slot).toBe('06:00');
  });
  it('converts 12:00 UTC (6am Central) to hour_slot "07:00"', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ startTime: '2026-11-20T12:00:00+00:00' })]);
    expect(out.hour_slot).toBe('07:00');
  });
  it('wraps a post-midnight Central hour past 24, not back to 00-03 (CLAUDE.md: the business day runs 4am-4am)', () => {
    // 05:00 UTC = 23:00 Central the PREVIOUS calendar day (CST) -- the business day's own
    // "midnight" hour, which qsr_daily_activity's real convention gives hour_slot "25:00"
    // for 1am, matching _currentHourSlot's h<4 => h+1+24 branch in signals.js.
    const [out] = lifelenzDarToDailyActivityShape([llRow({ startTime: '2026-11-21T06:00:00+00:00' })]); // 00:00 Central
    expect(out.hour_slot).toBe('25:00');
  });
  it('is DST-aware (CDT, summer) — not a fixed UTC-6 offset', () => {
    // 2026-07-15T09:00:00Z = 4:00am CDT (UTC-5) -- same 4am business-day start, different offset.
    const [out] = lifelenzDarToDailyActivityShape([llRow({ startTime: '2026-07-15T09:00:00+00:00' })]);
    expect(out.hour_slot).toBe('05:00');
  });
});

describe('lifelenzDarToDailyActivityShape: field mapping', () => {
  it('maps genuinely-equivalent fields and tags the row with _src', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow()]);
    expect(out._src).toBe('lifelenz');
    expect(out.loc).toBe('3708');
    expect(out.dt).toBe('2026-11-20');
    expect(out.product_sales).toBe(314.79);
    expect(out.prod_sales_scrubbed).toBe(314.79);
    expect(out.trans_scrubbed).toBe(41);
    expect(out.actual_punched_hours).toBeCloseTo(3.9666666666666668);
  });

  it('derives actual_punched_dollars EXACTLY from netSales x labourPercentageOfSales (algebraic recovery, not an approximation)', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ netSales: 45.68, labourPercentageOfSales: 96.21278458844134 })]);
    expect(out.actual_punched_dollars).toBeCloseTo(45.68 * 0.9621278458844134, 6);
    // Round-tripping back through the same ratio recovers the original labor% exactly --
    // confirms this is a real derivation, not a fabricated placeholder.
    expect(out.actual_punched_dollars / out.prod_sales_scrubbed * 100).toBeCloseTo(96.21278458844134, 6);
  });

  it('carries the three already-computed LifeLenz speed metrics as _ll*-prefixed fields, not forced through QSRSoft-shaped raw components', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ avgDtServiceTime: 232, avgFcServiceTime: 601, avgMfyServiceTime: 152 })]);
    expect(out._llOepeSec).toBe(232);
    expect(out._llR2pSec).toBe(601);
    expect(out._llKvsSec).toBe(152);
  });

  it('never fabricates the raw station components or needed/scheduled hours LifeLenz does not track', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow()]);
    expect(out.dt_untilserve).toBeUndefined();
    expect(out.dt_untilstore).toBeUndefined();
    expect(out.dt_trans_cnt).toBeUndefined();
    expect(out.fc_untilserve).toBeUndefined();
    expect(out.fc_trans_cnt).toBeUndefined();
    expect(out.healthy_count).toBeUndefined();
    expect(out.unhealthy_count).toBeUndefined();
    expect(out.total_needed_hours).toBeUndefined();
    expect(out.total_scheduled_hours).toBeUndefined();
    expect(out.mean_sales).toBeUndefined();
    expect(out.proj_sales_dollars).toBeUndefined();
  });

  it('derives null (not 0) actual_punched_dollars when either input is missing', () => {
    const [out] = lifelenzDarToDailyActivityShape([llRow({ labourPercentageOfSales: null })]);
    expect(out.actual_punched_dollars).toBeNull();
  });
});

describe('aggregateByStore: LifeLenz-fallback-sourced rows', () => {
  it('produces a transaction-weighted OEPE/R2P/KVS for a pure-LifeLenz day (no raw QSRSoft components to sum)', () => {
    const rows = lifelenzDarToDailyActivityShape([
      llRow({ startTime: '2026-11-20T11:00:00+00:00', transactions: 7, avgDtServiceTime: 201, avgFcServiceTime: 682, avgMfyServiceTime: 521 }),
      llRow({ startTime: '2026-11-20T12:00:00+00:00', transactions: 41, avgDtServiceTime: 232, avgFcServiceTime: 601, avgMfyServiceTime: 152 }),
    ]);
    const [store] = aggregateByStore(rows);
    // Transaction-weighted: (201*7 + 232*41) / (7+41) -- same methodology
    // engine/lifelenz-dar-daily.js's aggregateLifelenzDarDaily() already uses for the daily chains.
    expect(store.oepeSec).toBeCloseTo((201 * 7 + 232 * 41) / 48, 6);
    expect(store.r2pSec).toBeCloseTo((682 * 7 + 601 * 41) / 48, 6);
    expect(store.kvsSec).toBeCloseTo((521 * 7 + 152 * 41) / 48, 6);
  });

  it('still produces real labor%/TPPH for a pure-LifeLenz day (no special-casing needed -- derives from the same honestly-mapped real fields)', () => {
    const rows = lifelenzDarToDailyActivityShape([llRow({ netSales: 100, labourPercentageOfSales: 20, transactions: 10, actualPunchHours: 2 })]);
    const [store] = aggregateByStore(rows);
    expect(store.laborCostPct).toBeCloseTo(20, 6);
    expect(store.tpph).toBeCloseTo(5, 6); // 10 transactions / 2 punched hours
  });

  it('leaves parkPct/laborPct(staffing)/accRate honestly null for a pure-LifeLenz day -- never fabricated', () => {
    const rows = lifelenzDarToDailyActivityShape([llRow()]);
    const [store] = aggregateByStore(rows);
    expect(store.parkPct).toBeNull();
    expect(store.laborPct).toBeNull();
    expect(store.accRate).toBeNull();
  });

  it('prefers REAL QSRSoft raw components over the LifeLenz weighted average on a mixed day (same store, one real hour + one fallback hour)', () => {
    const qsrRow = {
      loc: '3708', dt_untilserve: 180000, dt_untilstore: 20000, dt_heldtime: 10000, dt_trans_cnt: 5,
      product_sales: 500,
    };
    const [llConverted] = lifelenzDarToDailyActivityShape([llRow({ avgDtServiceTime: 999 })]);
    const [store] = aggregateByStore([qsrRow, llConverted]);
    // Real dt_trans_cnt > 0 for this store, so oepeSec must come from the real components
    // (oepeSeconds formula), never from the LifeLenz weighted fallback (999s would be an obvious
    // tell if the fallback won by mistake).
    expect(store.oepeSec).not.toBe(999);
    expect(store.oepeSec).toBeCloseTo(Math.round(((180000 - 20000) - 10000) / 5 / 1000), 0);
  });

  it('returns null OEPE/R2P/KVS (not NaN or 0) when a LifeLenz row has no transactions to weight by', () => {
    const rows = lifelenzDarToDailyActivityShape([llRow({ transactions: 0 })]);
    const [store] = aggregateByStore(rows);
    expect(store.oepeSec).toBeNull();
    expect(store.r2pSec).toBeNull();
    expect(store.kvsSec).toBeNull();
  });
});
