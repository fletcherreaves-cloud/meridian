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
import { mapRow, extractRows } from '../../scripts/qsrsoft-register-audit-pull.mjs';

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
  manOverringAmt: 12.75,
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
