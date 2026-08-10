// @ts-nocheck
// Guards the units contract in analyzeRegisterAudit: counts are counts, dollars are dollars.
//
// The bug this exists to prevent (found 2026-08-08, Notes 61): refundCnt was computed as
//   e.refundCnt += (r.refundCnt||0) + (r.refundCashless||0)
// where refundCashless comes from a column literally named 'Refund Cashless $'
// (parsers/index.js:981). Adding dollars to a count made "Refunds (total)" display cents and
// tripped the >3 / >5 amber thresholds in the Register Audit table on dollar amounts rather
// than on how many refunds an employee actually rang.
//
// The tell is deliberately chosen so it cannot pass by coincidence: a single refund of
// $47.50 cashless. A count field that has absorbed dollars is non-integral.

import { describe, it, expect } from 'vitest';
import { analyzeRegisterAudit } from '../utils/register-audit.js';

const row = (over = {}) => ({
  loc: '43380', emp: 'E1', drawerSales: 1000, drawerGC: 100, drawerOpens: 3,
  cashOSDollar: 0, tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
  refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

describe('analyzeRegisterAudit — units contract', () => {
  it('does not fold cashless refund DOLLARS into the refund COUNT', () => {
    const { employees: [e] } = analyzeRegisterAudit([row({ refundCnt: 2, refundCashless: 47.5 })]);

    expect(e.refundCnt).toBe(2);                      // two refunds, not 49.5
    expect(Number.isInteger(e.refundCnt)).toBe(true); // a count is always integral
    expect(e.refundCashless).toBeCloseTo(47.5, 2);    // dollars survive, in their own field
  });

  it('keeps the count integral when only cashless dollars are present', () => {
    // The original bug's worst case: zero refunds rung, but a dollar amount present, which
    // produced refundCnt = 47.5 and pushed the employee past the >5 amber threshold.
    const { employees: [e] } = analyzeRegisterAudit([row({ refundCnt: 0, refundCashless: 47.5 })]);

    expect(e.refundCnt).toBe(0);
    expect(e.refundCnt).toBeLessThan(3);              // below the table's amber threshold
  });

  it('sums refund counts across days without drift', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row({ refundCnt: 1, refundCashless: 10.25 }),
      row({ refundCnt: 3, refundCashless: 5.75 }),
    ]);

    expect(e.refundCnt).toBe(4);
    expect(e.refundCashless).toBeCloseTo(16.0, 2);
    expect(e.avgRefundCnt).toBeCloseTo(2.0, 1);       // 4 refunds over 2 days
  });

  it('every *Cnt field stays integral for integral inputs', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row({ refundCnt: 2, refundCashless: 47.5, tRedACnt: 1, tRedADollar: 12.34, posOverCnt: 3, posOverAmt: 8.99 }),
    ]);

    for (const k of ['refundCnt', 'tRedACnt', 'tRedBCnt', 'posOver', 'drawerOpens']) {
      expect(Number.isInteger(e[k]), `${k} = ${e[k]} is not integral`).toBe(true);
    }
  });
});
