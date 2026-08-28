// @ts-nocheck
// Dispatch #183 — chase the store-clustered emp/mgr-meal gap dispatch #181 left open
// (memory/finding-emp-mgr-meal-reconciliation-2026-08-28.md,
//  memory/finding-audit-rows-registertype-duplication-2026-08-28.md).
//
// Root cause, live-measured against real Supabase data (both docs): dispatch #59 gave audit_rows
// one row per (loc, date, emp, register_type) — Cashier/Manager/Preparer, three separate API
// calls concatenated. That is correct for drawer-specific fields (drawerSales/drawerGC genuinely
// differ per register), but for the meal $ fields the Manager-type and Preparer-type API calls
// return IDENTICAL emp_meal_disc/mgr_meal_amt/mgr_meal_cnt values to each other (redistributed
// across different employee names within the day) — not real incremental register activity.
// Cashier-type ALONE already matches qsr_cash_sheet's independently-pulled total almost exactly.
//
// Before this fix, metricDaily/metricSeriesWithSource picked whichever SINGLE row for the day
// happened to sort first in ds.auditRows (loadAuditRows only orders by date) and returned that
// one row's value as if it were the store's whole-day total — two compounding bugs:
//   1) that row could be a Manager/Preparer-type row, which duplicates a smaller, non-additive
//      figure rather than the true (Cashier-type) total; and
//   2) even a Cashier-type row is only ONE EMPLOYEE's meal $, not summed across every cashier
//      employee working that day (auditRows is one row per (loc,date,emp,register_type) --
//      unlike every other source in this chain, which is one row per (loc,date)).
// The fix: filter the auditRows leg of empMealAmt/mgrMealAmt/mgrMealCnt to register_type ===
// 'cashier', and SUM across every matching row for the day (the 'sum' aggregation mode).

import { describe, it, expect } from 'vitest';
import { metricDaily, metricSeriesWithSource } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');

describe('dispatch #183 — auditRows meal fields: cashier-only, summed across employees', () => {
  it('empMealAmt: sums cashier-type rows across multiple employees, ignoring manager/preparer duplicates', () => {
    const ds = {
      auditRows: [
        // Manager/preparer duplicate a SMALLER, non-additive figure — must NOT contribute.
        { loc: '1', date: d('2026-08-17'), registerType: 'manager',  emp: 'Kayla O',  empMealDisc: 264.66 },
        { loc: '1', date: d('2026-08-17'), registerType: 'preparer', emp: 'Faith M',  empMealDisc: 264.66 },
        // Two different cashier employees the same day — both must be summed.
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'Naviee C', empMealDisc: 150.6 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'Jozlyn T', empMealDisc: 33.12 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-17'), 'empMealAmt')).toBeCloseTo(183.72, 6);
  });

  it('empMealAmt: row order does not matter (cashier rows interleaved with manager/preparer)', () => {
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'A', empMealDisc: 100 },
        { loc: '1', date: d('2026-08-17'), registerType: 'manager',  emp: 'B', empMealDisc: 264.66 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'C', empMealDisc: 23.87 },
        { loc: '1', date: d('2026-08-17'), registerType: 'preparer', emp: 'D', empMealDisc: 264.66 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-17'), 'empMealAmt')).toBeCloseTo(123.87, 6);
  });

  it('mgrMealAmt: same cashier-only, summed-across-employees behavior', () => {
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-17'), registerType: 'manager',  emp: 'A', mgrMealAmt: 53.96 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'B', mgrMealAmt: 62.33 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'C', mgrMealAmt: 58.55 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-17'), 'mgrMealAmt')).toBeCloseTo(120.88, 6);
  });

  it('mgrMealCnt: same cashier-only, summed-across-employees behavior', () => {
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-17'), registerType: 'manager',  emp: 'A', mgrMealCnt: 4 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'B', mgrMealCnt: 5 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier',  emp: 'C', mgrMealCnt: 2 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-17'), 'mgrMealCnt')).toBe(7);
  });

  it('empMealAmt: falls through to null when the day has ONLY manager/preparer rows, no cashier row', () => {
    // A day with no Cashier-type row at all must not silently fall back to a manager/preparer
    // duplicate — better to report no value than a known-wrong one.
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-05'), registerType: 'manager',  empMealDisc: 40 },
        { loc: '1', date: d('2026-08-05'), registerType: 'preparer', empMealDisc: 40 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-05'), 'empMealAmt')).toBe(null);
  });

  it('empMealAmt: cashier rows summing to 0 still yield null (mode "pos"), not a manager/preparer fallback', () => {
    // mode 'pos' requires the SUM > 0, so a real $0 cashier day correctly yields null here
    // (matches prior single-row semantics) rather than surfacing the manager/preparer figure --
    // that would reintroduce exactly the bug this dispatch fixes.
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-06'), registerType: 'cashier',  emp: 'A', empMealDisc: 0 },
        { loc: '1', date: d('2026-08-06'), registerType: 'cashier',  emp: 'B', empMealDisc: 0 },
        { loc: '1', date: d('2026-08-06'), registerType: 'manager',  empMealDisc: 30 },
        { loc: '1', date: d('2026-08-06'), registerType: 'preparer', empMealDisc: 30 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-08-06'), 'empMealAmt')).toBe(null);
  });

  it('rows with no registerType at all (pre-#59 backfill, defaults to cashier) still resolve and sum', () => {
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-06-01'), emp: 'A', empMealDisc: 12.5 },
        { loc: '1', date: d('2026-06-01'), emp: 'B', empMealDisc: 7.5 },
      ],
    };
    expect(metricDaily(ds, '1', d('2026-06-01'), 'empMealAmt')).toBe(20);
  });

  it('glimpseRows/ctrlRows still win over auditRows when they cover the day (order unchanged)', () => {
    const ds = {
      glimpseRows: [{ loc: '1', date: d('2026-08-17'), empMealAmt: 40 }],
      auditRows: [{ loc: '1', date: d('2026-08-17'), registerType: 'cashier', empMealDisc: 623.87 }],
    };
    expect(metricDaily(ds, '1', d('2026-08-17'), 'empMealAmt')).toBe(40);
  });

  it('metricSeriesWithSource: per-day cashier-only summed precedence holds across a range, mixed days', () => {
    const ds = {
      auditRows: [
        { loc: '1', date: d('2026-08-17'), registerType: 'manager', emp: 'X', empMealDisc: 264.66 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier', emp: 'A', empMealDisc: 500 },
        { loc: '1', date: d('2026-08-17'), registerType: 'cashier', emp: 'B', empMealDisc: 123.87 },
        { loc: '1', date: d('2026-08-18'), registerType: 'cashier', emp: 'A', empMealDisc: 0 },   // real 0 -> no value
        { loc: '1', date: d('2026-08-19'), registerType: 'preparer', emp: 'A', empMealDisc: 50 }, // no cashier row -> no value
      ],
    };
    const series = metricSeriesWithSource(ds, '1', { s: '2026-08-17', e: '2026-08-19' }, 'empMealAmt');
    expect(series['2026-08-17'].value).toBeCloseTo(623.87, 6);
    expect(series['2026-08-17'].source).toBe('auditRows');
    expect(series['2026-08-18']).toBeUndefined();
    expect(series['2026-08-19']).toBeUndefined();
  });
});
