// @ts-nocheck
// GH #1314's Register Audit Pull endpoint migration makes `cashOSDollar` genuinely `null` on
// every auto-pulled row (the new /data_layer/v1/ endpoint doesn't expose this field at all,
// confirmed live -- see memory/finding-register-audit-pull-endpoint-migration-2026-11-14.md).
// This pins that `null` stays `null` all the way through register-audit.js's per-employee
// aggregation rather than being silently treated as a real `$0.00` balanced reading anywhere --
// the exact "no data read as confirmed clean" failure mode CLAUDE.md flags as a recurring,
// serious bug class (prior #150/#178 incidents).
import { describe, it, expect } from 'vitest';
import { analyzeRegisterAudit, registerTypeBreakdown, computeTargetAwareRegisterFlags } from '../utils/register-audit.js';

const LOC = '43380';

const row = (date, over = {}) => ({
  loc: LOC, emp: 'E1', empToken: 'tok-e1', date,
  drawerSales: 1000, drawerGC: 100, drawerOpens: 3, cashOSDollar: null,
  tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
  refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

describe('analyzeRegisterAudit -- cashOSDollar:null never reads as a real zero', () => {
  it('e.cashOS and e.cashOSPctSelf are null (not 0) when every row has cashOSDollar:null', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row('2026-10-01'), row('2026-10-02'), row('2026-10-03'),
    ]);
    expect(e.cashOSDays).toBe(0);
    expect(e.cashOS).toBeNull();
    expect(e.cashOSPctSelf).toBeNull();
    // cashOSTotal is a raw accumulator (sums 0s when every reading is null) -- display
    // consumers must gate on e.cashOS/e.cashOSDays, never read cashOSTotal on its own.
    expect(e.cashOSTotal).toBe(0);
  });

  it('a real $0.00 balanced day is NOT excluded -- cashOSDays counts it, distinct from no-data days', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row('2026-10-01', { cashOSDollar: 0 }), // real, balanced reading
      row('2026-10-02'), // no reading at all (null)
    ]);
    expect(e.cashOSDays).toBe(1);
    expect(e.cashOS).toBe(0);
    expect(e.cashOSPctSelf).toBe(0);
  });

  it('a mix of real and null readings averages only over the real ones', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row('2026-10-01', { cashOSDollar: -10 }),
      row('2026-10-02'), // null -- must not dilute the average toward 0
      row('2026-10-03', { cashOSDollar: -10 }),
    ]);
    expect(e.cashOSDays).toBe(2);
    expect(e.avgCashOS).toBeCloseTo(-10, 6);
    expect(e.cashOS).toBeCloseTo(-10, 6);
  });
});

describe('registerTypeBreakdown -- same null-safety per register-type slice', () => {
  it('a register-type slice with no real cash-O/S reading reports et.cashOS as null', () => {
    const rows = [
      row('2026-10-01', { registerType: 'cashier' }),
      row('2026-10-01', { registerType: 'manager', cashOSDollar: -5 }),
    ];
    const breakdown = registerTypeBreakdown(rows);
    const entry = breakdown[LOC + '::tok-e1'];
    expect(entry.byType.cashier.cashOS).toBeNull();
    expect(entry.byType.manager.cashOS).toBeCloseTo(-5, 6);
  });
});

describe('computeTargetAwareRegisterFlags -- cashOS metric reports unavailable, not false-clean', () => {
  it('flags cashOS as unavailable (not egregious/repetitive) when no row in the window has a real reading', () => {
    const rows = [
      row('2026-10-25'), row('2026-10-26'), row('2026-10-27'), row('2026-10-28'), row('2026-10-29'),
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    const f = flags[LOC + '::E1'];
    expect(f.metrics.cashOS.unavailable).toBe(true);
    expect(f.metrics.cashOS.isEgregious).toBe(false);
    expect(f.metrics.cashOS.isRepetitive).toBe(false);
    expect(f.metrics.cashOS.totalRecentDays).toBe(0);
    expect(f.fullHistory.pct.cashOS).toBeNull();
  });

  it('other 4 metrics (which DO have real values) are unaffected by cashOS being all-null', () => {
    const rows = [
      row('2026-10-25', { tRedBDollar: 100 }), // well over target, should still flag normally
      row('2026-10-26', { tRedBDollar: 100 }),
      row('2026-10-27', { tRedBDollar: 100 }),
      row('2026-10-28'), row('2026-10-29'),
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    const f = flags[LOC + '::E1'];
    expect(f.metrics.cashOS.unavailable).toBe(true);
    expect(f.metrics.tRedB.unavailable).toBe(false);
    expect(f.metrics.tRedB.totalRecentDays).toBe(5); // tRedB field is never null here
  });
});
