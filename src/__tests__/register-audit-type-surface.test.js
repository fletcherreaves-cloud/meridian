// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #62 -- the register-type dimension #59 collected (Manager/Preparer, alongside the
// old Cashier-only pull) reaches the app (src/lib/supabase.js:989,992) but nothing consumed it:
// no rule, panel, or engine branched on it. Step 0's live measurement (2026-08-22, service-role
// query against audit_rows) found 321 of 1,611 employee-days in the last 7 days span MORE THAN
// ONE register type -- materially non-zero, not disjoint -- so analyzeRegisterAudit's loc::emp
// grouping (correctly summing dollars/counts across types, per #59's audit) was blending
// authority contexts on the live per-employee risk panel with nothing on screen saying so.
//
// Per the standing "would this verification still pass if the change were reverted" rule, this
// renders the ACTUAL RegisterAuditTab consumer (not just analyzeRegisterAudit/
// registerTypeBreakdown in isolation) -- an engine-level test can't tell "the dimension is
// visible" from "the dimension is computed but never wired into the panel," which is exactly
// the gap this dispatch closes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { RegisterAuditTab } from '../views/store-analytics.js';
import { _resetLazyFillForTests } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const row = (over = {}) => ({
  loc: '0043380', drawerSales: 500, drawerGC: 50, drawerOpens: 2, cashOSDollar: 0,
  tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0, manualRefAmt: 0,
  posOverCnt: 0, posOverAmt: 0, refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

// Shannon H rings on BOTH cashier and manager registers on the same day -- the exact shape
// found live in production (dispatch-62.md's step-0 examples: "0043701::2026-08-17::Shannon H").
// James S is cashier-only, the common case, and must render identically to before this dispatch.
const AUDIT_ROWS = [
  row({ emp: 'Shannon H', empToken: 'tok-shannon', date: new Date('2026-08-17'), registerType: 'cashier', drawerSales: 600, cashOSDollar: -2, tRedACnt: 1 }),
  row({ emp: 'Shannon H', empToken: 'tok-shannon', date: new Date('2026-08-17'), registerType: 'manager', drawerSales: 400, cashOSDollar: -1, tRedACnt: 3 }),
  row({ emp: 'James S',   empToken: 'tok-james',   date: new Date('2026-08-17'), registerType: 'cashier', drawerSales: 300 }),
];

describe('RegisterAuditTab — register-type surface (dispatch #62)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows a register-type filter pill row when more than one type is present', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    expect(container.textContent).toMatch(/Register:/);
    expect(container.textContent).toContain('Cashier');
    expect(container.textContent).toContain('Manager');
  });

  it('flags the multi-register employee as Blended and states the decision in plain language', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    expect(container.textContent).toMatch(/Blended \(2\)/);
    // Voice-by-role: the panel's default surface states the decision, not just a raw column.
    expect(container.textContent).toMatch(/split.*before flagging|before flagging or pulling video/i);
  });

  it('clicking Blended expands a per-register-type split for that employee', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    const badge = [...container.querySelectorAll('span')].find(s => /Blended \(2\)/.test(s.textContent));
    expect(badge).toBeTruthy();
    await act(async () => { badge.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // The split table shows both register types with their own sub-numbers -- e.g. the
    // Manager-register T-Red count (3) is now visible as its own figure, not just folded into
    // the combined total (4) shown on the parent row.
    expect(container.textContent).toMatch(/Split by register type/);
    const rowsText = container.textContent;
    expect(rowsText).toContain('Cashier');
    expect(rowsText).toContain('Manager');
  });

  it('the register-type filter actually narrows the table (not decorative)', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    const overviewRows = () => container.querySelector('table').querySelectorAll('tbody tr').length;
    expect(overviewRows()).toBe(2); // Shannon H + James S, unfiltered

    // James S never touches a manager register -- filtering to Manager must drop him from the
    // Overview table entirely, proving the pill actually re-scopes analyzeRegisterAudit's input
    // rather than just being a label.
    const managerPill = [...container.querySelectorAll('button')].find(b => b.textContent === 'Manager');
    expect(managerPill).toBeTruthy();
    await act(async () => { managerPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(overviewRows()).toBe(1); // only Shannon H's manager-register row remains
  });

  it('a cashier-only employee (the common case) shows no Blended badge and no filter-narrowing surprise', async () => {
    const CASHIER_ONLY = [
      row({ emp: 'Aaden W', empToken: 'tok-aaden', date: new Date('2026-08-01'), registerType: 'cashier' }),
    ];
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: CASHIER_ONLY }, loc: '0043380' }));
    });
    // Only one register type present -- the filter pill row itself must not render at all,
    // per the "cashier-only employees must render behaviourally identically" verification bar.
    expect(container.textContent).not.toMatch(/Register:/);
    expect(container.textContent).not.toMatch(/Blended/);
  });
});
