// @vitest-environment happy-dom
// @ts-nocheck
// StoreControlsTab (src/views/signals.js) shipped with a real React error #310 -- "Rendered fewer
// hooks than expected" -- caught live in production (owner screenshot, Signals panel error
// boundary). Root cause: the `modes` useMemo was called AFTER three early `return h(...)`
// statements. `raw` starts null on every mount, so the FIRST render always hit the "Loading…"
// early return before ever reaching that hook; once loadQsrStoreControls() resolved and `raw`/
// `rows` were populated, the SECOND render sailed past all three early returns and called the
// hook -- a different hook count between renders, which React refuses to reconcile.
// A static-markup test of either state alone cannot catch this: each render in isolation is
// perfectly valid JSX. Only mounting the REAL component (react-dom/client, not
// renderToStaticMarkup) and actually crossing the loading->loaded transition exercises both
// hook counts back to back, the same way the live crash did.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fakeRows = [
  { loc: '3708', updatedAt: '2026-09-01T00:00:00Z', config: { RFMControls: { tred_before_total_amount: 100 } } },
  { loc: '5183', updatedAt: '2026-09-01T00:00:00Z', config: {} },
];

// qsr_store_settings -- a second, independent loader StoreControlsTab now also calls (2026-09-04,
// same session as the hook-order fix: wired the cash-control automation's data into this tab).
const fakeSettingsRows = [
  { loc: '3708', updatedAt: '2026-09-04T00:00:00Z', cash: { drawerStartAmount: 100, drawerCount: 6, safeBackupAmount: 1800, maxStorewideCash: 10, maxDrawerCash: 2, cashRecyclerEnabled: false, allowCashAdjustments: false } },
];

vi.mock('../lib/supabase.js', () => ({
  loadQsrStoreControls: async () => fakeRows,
  loadQsrStoreSettings: async () => fakeSettingsRows,
  // StoreControlsTab renders DistrictStandardCheck as a child, which independently fetches its
  // own audit window -- unrelated to the hook-order bug, but must resolve or mounting throws.
  loadAuditRowsWindow: async () => [],
}));

const { StoreControlsTab } = await import('../views/signals.js');

describe('StoreControlsTab hook order across the loading -> loaded transition (dispatch, 2026-09-04)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('mounts in the loading state, then resolves to the loaded table without throwing (regression for React error #310)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mount -- first render is the `raw === null` "Loading…" state, exercising whatever hook
    // count that branch calls.
    act(() => { root.render(React.createElement(StoreControlsTab)); });
    expect(container.textContent).toContain('Loading store controls…');

    // Flush the mocked loadQsrStoreControls() promise and the resulting re-render -- the second
    // render sails past all three early returns into the full table body. If `modes` (or any
    // other hook) were still declared after those returns, this is exactly where React would
    // throw "Rendered fewer hooks than expected."
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).not.toContain('Loading store controls…');
    expect(container.textContent).toContain('Real per-store configuration');
  });

  it('clicking a store shows the store_settings cash slice as a separate, unreconciled section', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => { root.render(React.createElement(StoreControlsTab)); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const storeCell = [...container.querySelectorAll('td')].find(td => td.textContent.includes('Ardmore') || td.textContent.includes('3708'));
    expect(storeCell).toBeTruthy();
    act(() => { storeCell.closest('tr').dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('Store Settings — Cash (2nd source)');
    expect(container.textContent).toContain('Starting drawer bank: $100 × 6 drawer(s)');
    expect(container.textContent).toContain('not reconciled against the Cash Controls / Safe & Deposit cells above');
  });
});
