// @vitest-environment happy-dom
// @ts-nocheck
// Integration smoke test (dispatch #38) — mounts the ACTUAL RegisterAuditTab consumer, not just
// RevealName in isolation, per CLAUDE.md's "would this verification still pass if the change
// were reverted" rule: a test that only exercises RevealName can't tell "wired into the panel"
// from "wired into the panel but the prop got dropped at one of the 9 call sites." This renders
// the Overview table + narrative and clicks through one real reveal.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const rpcMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

import { RegisterAuditTab } from '../views/store-analytics.js';
import { _resetLazyFillForTests } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const AUDIT_ROWS = [
  { loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden', date: new Date('2026-08-01'),
    drawerSales: 1000, drawerGC: 100, drawerOpens: 3, cashOSDollar: -12, cashOS: -12, cashOSTotal: -12,
    tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0, manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
    refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0 },
];

describe('RegisterAuditTab — reveal wired through the actual panel (dispatch #38)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    rpcMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.prompt = vi.fn(() => 'cash variance follow-up');
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete window.prompt;
  });

  it('shows a reveal affordance (not a name, not raw "Unknown") in the Overview table for a real token', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    expect(container.textContent).toMatch(/reveal/i);
    expect(container.textContent).not.toContain('Aaden W');
  });

  it('clicking the table-cell reveal resolves the name AND updates the narrative paragraph below it, from one shared cache', async () => {
    rpcMock.mockResolvedValue({ data: 'Aaden W', error: null });
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });

    const cell = container.querySelector('td span'); // the table-cell RevealName
    expect(cell).toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(rpcMock).toHaveBeenCalledWith('reveal_employee_identity', { p_token: 'tok-aaden', p_reason: 'cash variance follow-up' });
    // Revealed once -> appears everywhere in the panel (table cell AND the narrative's Cash
    // Over/Short paragraph, both reading the SAME lifted `revealed` cache) without a 2nd prompt.
    const occurrences = (container.textContent.match(/Aaden W/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    expect(window.prompt).toHaveBeenCalledTimes(1);
  });
});
