// @ts-nocheck
// analyzeRegisterAudit's identity-vault retrofit (dispatch #37, Direction B): e.id is now the
// emp_token, and no returned employee object carries a plaintext name field anywhere.
import { describe, it, expect } from 'vitest';
import { analyzeRegisterAudit } from '../utils/register-audit.js';

const row = (over = {}) => ({
  loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden-w', date: '2026-08-01',
  drawerSales: 1000, drawerGC: 100, drawerOpens: 3,
  cashOSDollar: 0, tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
  refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

describe('analyzeRegisterAudit — identity-vault retrofit', () => {
  it('sets e.id to the emp_token, not the plaintext name', () => {
    const { employees: [e] } = analyzeRegisterAudit([row()]);
    expect(e.id).toBe('tok-aaden-w');
  });

  it('never exposes a plaintext name field anywhere on the returned employee object', () => {
    const { employees: [e] } = analyzeRegisterAudit([row({ emp: 'Real Person Name' })]);
    expect(e.emp).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain('Real Person Name');
  });

  it('falls back to "Unknown" only when a row genuinely has no token (pre-backfill state)', () => {
    const { employees: [e] } = analyzeRegisterAudit([row({ empToken: null })]);
    expect(e.id).toBe('Unknown');
  });

  it('takes the first non-null token across a group’s rows, tolerating a pre-backfill gap', () => {
    const rows = [
      row({ date: '2026-08-01', empToken: null }),
      row({ date: '2026-08-02', empToken: 'tok-aaden-w' }),
    ];
    const { employees: [e] } = analyzeRegisterAudit(rows);
    expect(e.id).toBe('tok-aaden-w');
    expect(e.days).toBe(2); // both rows still counted toward this employee's aggregation
  });

  it('.name stays the STORE name (STORE_NAMES[loc]), not personnel data', () => {
    const { employees: [e] } = analyzeRegisterAudit([row({ loc: '9999999' })]);
    expect(e.name).toBe('Store 9999999');
  });

  it('two different employees at the same store still aggregate into separate records, grouped internally by name', () => {
    const rows = [
      row({ emp: 'Alice', empToken: 'tok-alice', drawerSales: 500 }),
      row({ emp: 'Bob',   empToken: 'tok-bob',   drawerSales: 700 }),
    ];
    const { employees } = analyzeRegisterAudit(rows);
    expect(employees.length).toBe(2);
    const ids = employees.map(e => e.id).sort();
    expect(ids).toEqual(['tok-alice', 'tok-bob']);
  });
});
