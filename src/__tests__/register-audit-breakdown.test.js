// @ts-nocheck
// Dispatch #62 -- registerTypeBreakdown() pins the pure logic behind the Register Audit panel's
// per-register-type split (the UI wiring itself is covered by
// register-audit-type-surface.test.js, per the standing "render the actual consumer" rule).
import { describe, it, expect } from 'vitest';
import { analyzeRegisterAudit, registerTypeBreakdown } from '../utils/register-audit.js';

const row = (over = {}) => ({
  loc: '0043380', emp: 'E1', empToken: 'tok-e1', date: '2026-08-01',
  drawerSales: 500, drawerGC: 50, drawerOpens: 2,
  cashOSDollar: 0, tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
  refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

describe('registerTypeBreakdown', () => {
  it('returns nothing for a cashier-only employee -- no manufactured entry for the common case', () => {
    const out = registerTypeBreakdown([row({ registerType: 'cashier' })]);
    expect(Object.keys(out)).toEqual([]);
  });

  it('splits a multi-register employee by type, matching the combined totals when summed', () => {
    const rows = [
      row({ registerType: 'cashier', drawerSales: 600, tRedACnt: 1, cashOSDollar: -2 }),
      row({ registerType: 'manager', drawerSales: 400, tRedACnt: 3, cashOSDollar: -1 }),
    ];
    const combined = analyzeRegisterAudit(rows).employees[0];
    const out = registerTypeBreakdown(rows);
    const key = '0043380::tok-e1';

    expect(Object.keys(out)).toEqual([key]);
    expect(out[key].registerTypes).toEqual(['cashier', 'manager']);
    expect(out[key].byType.cashier.totalSales).toBeCloseTo(600, 2);
    expect(out[key].byType.manager.totalSales).toBeCloseTo(400, 2);
    expect(out[key].byType.cashier.tRedACnt).toBe(1);
    expect(out[key].byType.manager.tRedACnt).toBe(3);

    // Per-type sums must reconcile back to analyzeRegisterAudit's own (audited, unchanged)
    // combined totals -- the breakdown is an added view, not a re-derivation.
    expect(out[key].byType.cashier.totalSales + out[key].byType.manager.totalSales)
      .toBeCloseTo(combined.totalSales, 2);
    expect(out[key].byType.cashier.tRedACnt + out[key].byType.manager.tRedACnt)
      .toBe(combined.tRedACnt);
  });

  it('excludes employees with no token rather than risk merging two different people under "Unknown"', () => {
    const rows = [
      row({ empToken: null, registerType: 'cashier' }),
      row({ empToken: null, registerType: 'manager' }),
    ];
    const out = registerTypeBreakdown(rows);
    expect(Object.keys(out)).toEqual([]);
  });

  it('keys by loc::token, not by the raw employee name — token stays the join/grouping key even though dispatch #200 also carries the name (empName) on each value', () => {
    const rows = [
      row({ emp: 'Real Person Name', empToken: 'tok-real', registerType: 'cashier' }),
      row({ emp: 'Real Person Name', empToken: 'tok-real', registerType: 'preparer' }),
    ];
    const out = registerTypeBreakdown(rows);
    expect(Object.keys(out)).toEqual(['0043380::tok-real']);
    // Dispatch #200 (Task Group B) intentionally carries the plaintext name through now — the
    // KEY is still the token (this test's own point), but the VALUE legitimately contains the
    // name, same as analyzeRegisterAudit's own employee objects (register-audit-identity.test.js).
    expect(out['0043380::tok-real'].byType.cashier.empName).toBe('Real Person Name');
  });

  it('analyzeRegisterAudit itself now carries registerTypes per employee, additive to the existing shape', () => {
    const rows = [
      row({ registerType: 'cashier' }),
      row({ registerType: 'preparer' }),
    ];
    const { employees: [e] } = analyzeRegisterAudit(rows);
    expect(e.registerTypes).toEqual(['cashier', 'preparer']);
    // Everything that existed before dispatch #62 is untouched.
    expect(e.days).toBe(1);
    expect(e.totalSales).toBeCloseTo(1000, 2);
  });
});
