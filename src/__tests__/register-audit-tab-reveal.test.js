// @vitest-environment happy-dom
// @ts-nocheck
// Integration smoke test (dispatch #200, rewrite of dispatch #38's original) — mounts the
// ACTUAL RegisterAuditTab consumer, not just a unit around register-audit.js, per CLAUDE.md's
// "would this verification still pass if the change were reverted" rule: a test that only
// exercises analyzeRegisterAudit() can't tell "wired into the panel" from "wired into the panel
// but a call site still hides the name behind RevealName."
//
// Dispatch #200 (Task Group B) removed the click/reason/RPC reveal gate for Register Audit
// specifically -- owner, live: "on the Register Audit tab, no need to hide the employee names
// here. anyone with access to register audit on qsrsoft can see names anyway." Investigated
// first, per the dispatch's own instruction: audit_rows.emp (the plaintext name) was ALREADY
// present, unredacted, in every row this panel loads -- analyzeRegisterAudit() was discarding
// it before returning employee objects to the panel. So this is a display-only change; nothing
// about what data reaches the browser changes. RevealName itself (dispatch #38) is UNCHANGED
// and stays covered by reveal-name.test.js -- it's still load-bearing for Security Findings
// (security-panel.js), whose underlying data genuinely has no raw name alongside the token.
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

describe('RegisterAuditTab — employee names render directly, no reveal gate (dispatch #200)', () => {
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

  it('shows the real name directly in the Overview table — no reveal click, no RPC call', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    expect(container.textContent).toContain('Aaden W');
    expect(container.textContent).not.toMatch(/reveal/i);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('the name also appears directly in the narrative paragraph below the table, same data, no second lookup', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: AUDIT_ROWS }, loc: '0043380' }));
    });
    const occurrences = (container.textContent.match(/Aaden W/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2); // table cell + narrative(s)
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('a pre-backfill row with no name falls back to the token, not a raw click target', async () => {
    const rowsNoName = [{ ...AUDIT_ROWS[0], emp: '', empToken: null }];
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: rowsNoName }, loc: '0043380' }));
    });
    expect(container.textContent).toContain('Unknown');
    expect(container.textContent).not.toMatch(/reveal/i);
  });
});
