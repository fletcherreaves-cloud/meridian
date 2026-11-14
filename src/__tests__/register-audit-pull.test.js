// @ts-nocheck
// scripts/qsrsoft-register-audit-pull.mjs's mapRow() (dispatch #35, migrated 2026-11-14 for GH
// issue #1314). Every formula below was confirmed live against the real on-screen Register
// Audit report (memory/finding-register-audit-pull-endpoint-migration-2026-11-14.md has the
// exact rows and arithmetic) -- this fixture is shaped like the REAL response, not a guess, and
// the T-Red Pct test below specifically pins the CORRECTED formula ($-share-of-sales, not the
// old qty/transactions one, which was checked against real data and rejected).
import { describe, it, expect, vi } from 'vitest';
import { mapRow, extractRows, buildUrl, REGISTER_TYPES, dedupeAuditRows } from '../../scripts/qsrsoft-register-audit-pull.mjs';

// Shaped like the new data_layer/v1/cash/register-audit-by-employee response (confirmed live
// 2026-11-14), with field VALUES chosen to be internally consistent with the confirmed formulas
// (e.g. drawerSales/drawerGC really does equal the Average Check this fixture implies).
const SAMPLE_ROW = {
  date: '2026-08-12', storeNum: 3708, empId: 'E4471', empName: 'Aaden W',
  netSalesAmt: 1240.50, netSalesEatinQty: 50, netSalesTakeoutQty: 68, // trans = 118
  promoAmt: 42.10, promoQty: 9,
  tredsBeforeQty: 4, tredsBeforeAmt: 18.40,
  tredsAfterQty: 1, tredsAfterAmt: 5.99,
  drawerOpensQty: 6,
  overringQty: 2, overringAmt: 3.50,
  manualRefundOverrings: 12.75,
  cashRefundsQty: 2, cashRefundsAmt: 8.00,
  cashlessRefundsQty: 1, cashlessRefundsAmt: 4.50,
  empMealDiscountQty: 1, empMealDiscountAmt: 6.25,
  mgrMealDiscountQty: 0, mgrMealDiscountAmt: 0,
};

describe('mapRow() — field-by-field against the confirmed response shape', () => {
  it('pads nsn to a 7-char loc and passes busnDt/empName through as date/emp', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.loc).toBe('0003708');
    expect(r.date).toBe('2026-08-12');
    expect(r.emp).toBe('Aaden W');
  });

  it('maps empId directly from the response\'s own empId field, additively alongside emp', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.empId).toBe('E4471');
  });

  it('empId is null (not undefined/empty string) when empId is missing -- same honest-missing contract as manualRefCnt', () => {
    const { empId, ...withoutId } = SAMPLE_ROW;
    const r = mapRow(withoutId);
    expect(r.empId).toBeNull();
  });

  it('empId trims whitespace and treats a blank string the same as missing', () => {
    expect(mapRow({ ...SAMPLE_ROW, empId: '  E4471  ' }).empId).toBe('E4471');
    expect(mapRow({ ...SAMPLE_ROW, empId: '' }).empId).toBeNull();
  });

  it('maps drawerSales from netSalesAmt and drawerGC from netSalesEatinQty+netSalesTakeoutQty (the analyzeRegisterAudit-consumed pair)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.drawerSales).toBe(1240.50);
    expect(r.drawerGC).toBe(118); // 50 + 68
  });

  it('derives avgCheck = sales/(eatIn+takeout) even though the engine recomputes its own', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.avgCheck).toBeCloseTo(1240.50 / 118, 6);
  });

  it('keeps manualRefAmt (manualRefundOverrings) and posOverAmt/posOverCnt (overringAmt/overringQty) as DISTINCT columns, not folded together', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.manualRefAmt).toBe(12.75);
    expect(r.posOverAmt).toBe(3.50);
    expect(r.posOverCnt).toBe(2);
  });

  it('manualRefCnt stays null -- confirmed absent on the new endpoint too (no Qty sibling field exists)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.manualRefCnt).toBeNull();
  });

  it('cashOSDollar/cashOSPct are always null -- confirmed unavailable from this endpoint (see mapRow\'s header comment for what was tried)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.cashOSDollar).toBeNull();
    expect(r.cashOSPct).toBeNull();
  });

  it('refundCnt sums BOTH cash and cashless refund counts', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.refundCnt).toBe(3); // 2 cash + 1 cashless
    expect(r.refundCash).toBe(8.00);
    expect(r.refundCashless).toBe(4.50);
  });

  it('derives T-Red Pct as a $ SHARE OF SALES (amt/sales), NOT qty/transactions -- the corrected formula, confirmed live against real on-screen values (see header comment)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.tRedBCnt).toBe(4);
    expect(r.tRedBDollar).toBe(18.40);
    expect(r.tRedBPct).toBeCloseTo(18.40 / 1240.50, 6);
    expect(r.tRedBAvg).toBeCloseTo(18.40 / 4, 6);
    expect(r.tRedACnt).toBe(1);
    expect(r.tRedADollar).toBe(5.99);
    expect(r.tRedAPct).toBeCloseTo(5.99 / 1240.50, 6);
    expect(r.tRedAAvg).toBeCloseTo(5.99 / 1, 6);
  });

  it('derives promoPct as a fraction of sales', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.promoAmt).toBe(42.10);
    expect(r.promoCnt).toBe(9);
    expect(r.promoPct).toBeCloseTo(42.10 / 1240.50, 6);
  });

  it('maps employee/manager meal discount amount+qty pairs directly', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.empMealDisc).toBe(6.25);
    expect(r.empMealCh).toBe(1);
    expect(r.mgrMealAmt).toBe(0);
    expect(r.mgrMealCnt).toBe(0);
  });

  it('never divides by zero into NaN/Infinity — a zero-transaction row derives all ratios as null, not garbage', () => {
    const r = mapRow({ ...SAMPLE_ROW, netSalesEatinQty: 0, netSalesTakeoutQty: 0, netSalesAmt: 0, tredsBeforeQty: 0, tredsAfterQty: 0 });
    expect(r.avgCheck).toBeNull();
    expect(r.cashOSPct).toBeNull();
    expect(r.promoPct).toBeNull();
    expect(r.tRedBPct).toBeNull();
    expect(r.tRedBAvg).toBeNull();
    expect(r.tRedAPct).toBeNull();
    expect(r.tRedAAvg).toBeNull();
    expect(Number.isNaN(r.avgCheck)).toBe(false);
    expect(Number.isFinite(r.cashOSPct) || r.cashOSPct === null).toBe(true);
  });

  it('drawerGC is null (not 0) when BOTH eatin/takeout qty are missing, but sums whichever is present otherwise', () => {
    const { netSalesEatinQty, netSalesTakeoutQty, ...withoutQtys } = SAMPLE_ROW;
    expect(mapRow(withoutQtys).drawerGC).toBeNull();
    expect(mapRow({ ...SAMPLE_ROW, netSalesEatinQty: undefined }).drawerGC).toBe(68);
  });

  it('handles a missing/blank empName by returning an empty emp string rather than throwing (caller filters these out)', () => {
    const r = mapRow({ ...SAMPLE_ROW, empName: null });
    expect(r.emp).toBe('');
  });

  it('pads a 4-digit storeNum the same way as a 5-digit one', () => {
    expect(mapRow({ ...SAMPLE_ROW, storeNum: 6178 }).loc).toBe('0006178');
    expect(mapRow({ ...SAMPLE_ROW, storeNum: 43701 }).loc).toBe('0043701');
  });

  // Dispatch #59 -- registerType is a REQUEST FILTER, never a response field (the API returns no
  // such key; see SAMPLE_ROW above, which has none). mapRow() takes it as an argument for this
  // reason, defaulting to 'cashier' so every test above (and every pre-#59 call site) keeps its
  // exact prior behaviour unchanged.
  describe('registerType (dispatch #59) -- argument, not a response field', () => {
    it('defaults to "cashier" when the caller passes nothing, matching every pre-#59 call site', () => {
      expect(mapRow(SAMPLE_ROW).registerType).toBe('cashier');
    });
    it('is set from the caller-supplied argument, independent of anything on the raw row', () => {
      expect(mapRow(SAMPLE_ROW, 'manager').registerType).toBe('manager');
      expect(mapRow(SAMPLE_ROW, 'preparer').registerType).toBe('preparer');
    });
    it('a registerType field on the raw row itself (if the API ever added one) would be ignored -- the argument is authoritative', () => {
      expect(mapRow({ ...SAMPLE_ROW, registerType: 'bogus' }, 'manager').registerType).toBe('manager');
    });
  });
});

describe('buildUrl (dispatch #59) -- registerType is a query parameter', () => {
  it('defaults to cashier, matching mapRow\'s own default', () => {
    const url = new URL(buildUrl('2026-08-01', '2026-08-07'));
    expect(url.searchParams.get('registerType')).toBe('cashier');
  });
  it('carries whichever registerType is passed', () => {
    for (const t of REGISTER_TYPES) {
      const url = new URL(buildUrl('2026-08-01', '2026-08-07', t));
      expect(url.searchParams.get('registerType')).toBe(t);
    }
  });
  it('REGISTER_TYPES is exactly the three the Register Audit report offers', () => {
    expect(REGISTER_TYPES).toEqual(['cashier', 'manager', 'preparer']);
  });
});

// Dispatch #59's own verification bar: "Prove the collision first. Write the failing case -- same
// (loc, date, emp) with two register types -- and show it overwrites on today's PK and doesn't on
// the new one." Simulated here as a plain upsert-semantics reducer (last-row-wins per key), since
// this sandbox has no live Supabase to exercise a real upsert against -- this tests the KEY SHAPE
// the migration changes, which is exactly what an onConflict target controls.
describe('the PK collision this dispatch\'s migration fixes (dispatch #59)', () => {
  // Mirrors what a real Postgres `upsert(rows, {onConflict: <cols>})` does: later rows with an
  // identical key silently replace earlier ones with the same key.
  function simulateUpsert(rows, keyFn) {
    const byKey = new Map();
    for (const r of rows) byKey.set(keyFn(r), r);
    return [...byKey.values()];
  }

  it('on the OLD (loc,date,emp) key, a Cashier row and a Manager row for the same employee-day collide -- one is silently lost', () => {
    const cashierRow = mapRow(SAMPLE_ROW, 'cashier');
    const managerRow = mapRow(SAMPLE_ROW, 'manager'); // SAME loc/date/emp as SAMPLE_ROW -- only registerType differs
    const oldKey = r => `${r.loc}|${r.date}|${r.emp}`;
    const result = simulateUpsert([cashierRow, managerRow], oldKey);
    expect(result).toHaveLength(1); // the collision -- one row silently overwrote the other
    expect(result[0].registerType).toBe('manager'); // last-write-wins: cashier's row is gone
  });

  it('on the NEW (loc,date,emp,register_type) key, the same two rows do NOT collide -- both survive', () => {
    const cashierRow = mapRow(SAMPLE_ROW, 'cashier');
    const managerRow = mapRow(SAMPLE_ROW, 'manager');
    const newKey = r => `${r.loc}|${r.date}|${r.emp}|${r.registerType}`;
    const result = simulateUpsert([cashierRow, managerRow], newKey);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.registerType).sort()).toEqual(['cashier', 'manager']);
  });
});

// extractRows() -- the envelope unwrapper. The OLD endpoint's real envelope was {resp:[...]}
// (measured run 32399056951); the NEW endpoint (GH #1314 migration, 2026-11-14) was directly
// observed live to send { result: [...] } instead -- confirmed by reading real response bodies
// during the migration, not guessed. A wrong key here returns [] and prints "0 rows returned",
// which is indistinguishable from an empty report -- so it is worth a test that fails loudly if
// the key is ever changed back.
describe('extractRows — response envelope', () => {
  const R = [{ nsn: 6178 }, { nsn: 3708 }];

  it("unwraps the REAL envelope the new endpoint sends: { result: [...] }", () => {
    expect(extractRows({ result: R }, 'unit')).toEqual(R);
  });

  it('still accepts a bare array, and the two undocumented alternates (old envelope + a generic fallback)', () => {
    expect(extractRows(R, 'unit')).toEqual(R);
    expect(extractRows({ resp: R }, 'unit')).toEqual(R);
    expect(extractRows({ data: R }, 'unit')).toEqual(R);
  });

  it('returns [] and logs the SHAPE — key names and array lengths only, never values — on an unknown envelope', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(extractRows({ payload: R, status: 'ok', err: null }, 'chunk-1')).toEqual([]);
    const msg = err.mock.calls[0][0];
    expect(msg).toContain('payload[2]');
    expect(msg).toContain('status:string');
    expect(msg).toContain('err:null');
    expect(msg).not.toContain('6178');   // no row VALUES in the log — every row is employee PII
    err.mockRestore();
  });

  it('does not throw on a non-object body (an HTML error page parsed as text)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(extractRows('<html>nope</html>', 'unit')).toEqual([]);
    expect(extractRows(null, 'unit')).toEqual([]);
    err.mockRestore();
  });
});

// GH #1314 follow-up (2026-11-14, live-dispatch run #107): the `preparer` register type's
// response can carry two rows for the identical (loc, date, emp, registerType) composite, which
// collides the DB's onConflict key and fails Postgres with "ON CONFLICT DO UPDATE command cannot
// affect row a second time" -- confirmed live, cashier (1060 rows) and manager (488 rows) both
// saved cleanly in that same run, only preparer hit this. Root cause of WHY two rows share a key
// is not yet confirmed (sandbox network access to re-probe the live endpoint is WAF-blocked) --
// this dedup is a resilience measure so one collision can't fail the entire register-type
// window, not a claim about what's producing the duplicate.
describe('dedupeAuditRows() — the #1314 preparer-duplicate resilience fix', () => {
  const row = (over = {}) => ({ loc: '0003708', date: '2026-11-10', emp: 'Jordan P', registerType: 'preparer', empId: 'E1', ...over });

  it('passes through rows with no duplicates unchanged', () => {
    const rows = [row({ emp: 'A' }), row({ emp: 'B' }), row({ emp: 'C' })];
    expect(dedupeAuditRows(rows)).toHaveLength(3);
  });

  it('collapses a duplicate (loc,date,emp,registerType) to one row, keeping the LATER one', () => {
    const a = row({ empId: 'E1', drawerSales: 100 });
    const b = row({ empId: 'E2', drawerSales: 200 }); // same loc/date/emp/registerType as a
    const result = dedupeAuditRows([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].empId).toBe('E2');
    expect(result[0].drawerSales).toBe(200);
  });

  it('does NOT collide two rows that differ only by registerType (cashier vs preparer are independent keys)', () => {
    const cashier = row({ registerType: 'cashier' });
    const preparer = row({ registerType: 'preparer' });
    expect(dedupeAuditRows([cashier, preparer])).toHaveLength(2);
  });

  it('does NOT collide two rows for the same employee on DIFFERENT dates', () => {
    const d1 = row({ date: '2026-11-10' });
    const d2 = row({ date: '2026-11-11' });
    expect(dedupeAuditRows([d1, d2])).toHaveLength(2);
  });

  it('logs every collision via the injected warn function, naming loc/date/emp/type and both empIds', () => {
    const warn = vi.fn();
    const a = row({ empId: 'E1' });
    const b = row({ empId: 'E2' });
    dedupeAuditRows([a, b], warn);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0];
    expect(msg).toContain('0003708');
    expect(msg).toContain('2026-11-10');
    expect(msg).toContain('Jordan P');
    expect(msg).toContain('preparer');
    expect(msg).toContain('E1');
    expect(msg).toContain('E2');
  });

  it('handles an empty array without throwing', () => {
    expect(dedupeAuditRows([])).toEqual([]);
  });
});
