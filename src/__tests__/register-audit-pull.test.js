// @ts-nocheck
// scripts/qsrsoft-register-audit-pull.mjs's mapRow() (dispatch #35) -- no supabase/fetch
// dependency in that function itself, cheap to test directly, same reasoning
// pull-outcome.test.js/pipeline-contract.test.js already give for testing a scripts/ module
// from src/__tests__/. This is the ONLY verification possible from this sandbox (no live
// QSRSoft credentials or network access -- see memory/dispatch35-register-audit-implementation.md)
// so it's deliberately thorough: every field mapping and derivation dispatch #34's capture
// left ambiguous is covered here against realistic fixture rows shaped like the documented
// real response, not against actual production data.
import { describe, it, expect, vi } from 'vitest';
import { mapRow, extractRows, buildUrl, REGISTER_TYPES } from '../../scripts/qsrsoft-register-audit-pull.mjs';

// Shaped like dispatch #34's captured field list (memory/dispatch-34-phase0a-findings.md Part 1).
const SAMPLE_ROW = {
  busnDt: '2026-08-12', nsn: 3708, empID: 'E4471', empName: 'Aaden W',
  allNetSales: 1240.50, transactions: 118,
  overShortAmt: -6.25,
  promoAmt: 42.10, promoQty: 9,
  tRedBeforeQty: 4, tRedBeforeAmt: 18.40,
  tRedAfterQty: 1, tRedAfterAmt: 5.99,
  drawerOpens: 6,
  overringQty: 2, overringAmt: 3.50,
  manOverringAmt: 12.75, manOverringQty: 1,
  refundCashQty: 2, refundCashAmt: 8.00,
  refundCashlessQty: 1, refundCashlessAmt: 4.50,
  empMealDiscQty: 1, empMealDiscAmt: 6.25,
  mgrMealDiscQty: 0, mgrMealDiscAmt: 0,
};

describe('mapRow() — field-by-field against the confirmed response shape', () => {
  it('pads nsn to a 7-char loc and passes busnDt/empName through as date/emp', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.loc).toBe('0003708');
    expect(r.date).toBe('2026-08-12');
    expect(r.emp).toBe('Aaden W');
  });

  it('maps empId from empID (dispatch #51) additively alongside emp -- confirmed field name, not inferred', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.empId).toBe('E4471');
  });

  it('empId is null (not undefined/empty string) when empID is missing -- same honest-missing contract as manualRefCnt', () => {
    const { empID, ...withoutId } = SAMPLE_ROW;
    const r = mapRow(withoutId);
    expect(r.empId).toBeNull();
  });

  it('empId trims whitespace and treats a blank string the same as missing', () => {
    expect(mapRow({ ...SAMPLE_ROW, empID: '  E4471  ' }).empId).toBe('E4471');
    expect(mapRow({ ...SAMPLE_ROW, empID: '' }).empId).toBeNull();
  });

  it('maps drawerSales/drawerGC from allNetSales/transactions (the analyzeRegisterAudit-consumed pair)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.drawerSales).toBe(1240.50);
    expect(r.drawerGC).toBe(118);
  });

  it('derives avgCheck = sales/transactions even though the engine recomputes its own', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.avgCheck).toBeCloseTo(1240.50 / 118, 6);
  });

  it('keeps manualRefAmt (manOverringAmt) and posOverAmt/posOverCnt (overringAmt/overringQty) as DISTINCT columns, not folded together', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.manualRefAmt).toBe(12.75);
    expect(r.posOverAmt).toBe(3.50);
    expect(r.posOverCnt).toBe(2);
  });

  it('maps manualRefCnt from manOverringQty (dispatch #44) -- the Amt/Qty sibling pair every other override category already has', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.manualRefCnt).toBe(1);
    expect(r.manualRefCnt).not.toBe(r.manualRefAmt);
  });

  it('manualRefCnt is null (not 0) when the response omits manOverringQty -- num()\'s honest-missing contract, same as every other optional field', () => {
    const { manOverringQty, ...withoutQty } = SAMPLE_ROW;
    const r = mapRow(withoutQty);
    expect(r.manualRefCnt).toBeNull();
  });

  it('cashOSDollar is the raw overShortAmt; cashOSPct is derived as a fraction of sales', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.cashOSDollar).toBe(-6.25);
    expect(r.cashOSPct).toBeCloseTo(-6.25 / 1240.50, 6);
  });

  it('refundCnt sums BOTH cash and cashless refund counts (dispatch #34\'s own high-confidence mapping)', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.refundCnt).toBe(3); // 2 cash + 1 cashless
    expect(r.refundCash).toBe(8.00);
    expect(r.refundCashless).toBe(4.50);
  });

  it('derives T-Red rate (qty/transactions) and average $ (amt/qty) for both Before and After', () => {
    const r = mapRow(SAMPLE_ROW);
    expect(r.tRedBCnt).toBe(4);
    expect(r.tRedBDollar).toBe(18.40);
    expect(r.tRedBPct).toBeCloseTo(4 / 118, 6);
    expect(r.tRedBAvg).toBeCloseTo(18.40 / 4, 6);
    expect(r.tRedACnt).toBe(1);
    expect(r.tRedADollar).toBe(5.99);
    expect(r.tRedAPct).toBeCloseTo(1 / 118, 6);
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
    const r = mapRow({ ...SAMPLE_ROW, transactions: 0, allNetSales: 0, tRedBeforeQty: 0, tRedAfterQty: 0 });
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

  it('handles a missing/blank empName by returning an empty emp string rather than throwing (caller filters these out)', () => {
    const r = mapRow({ ...SAMPLE_ROW, empName: null });
    expect(r.emp).toBe('');
  });

  it('pads a 4-digit nsn the same way as a 5-digit one', () => {
    expect(mapRow({ ...SAMPLE_ROW, nsn: 6178 }).loc).toBe('0006178');
    expect(mapRow({ ...SAMPLE_ROW, nsn: 43701 }).loc).toBe('0043701');
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

// extractRows() -- the envelope unwrapper. Three separate CI runs were burned guessing this key
// ([], {result}, {data}) before run 32399056951's shape log measured the real one: {resp[3793]}.
// A wrong key here returns [] and prints "0 rows returned", which is indistinguishable from an
// empty report -- so it is worth a test that fails loudly if the key is ever changed back.
describe('extractRows — response envelope', () => {
  const R = [{ nsn: 6178 }, { nsn: 3708 }];

  it("unwraps the REAL envelope QSRSoft sends: { resp: [...] }", () => {
    expect(extractRows({ resp: R }, 'unit')).toEqual(R);
  });

  it('still accepts a bare array, and the two undocumented alternates', () => {
    expect(extractRows(R, 'unit')).toEqual(R);
    expect(extractRows({ result: R }, 'unit')).toEqual(R);
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
