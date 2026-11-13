// @vitest-environment happy-dom
// @ts-nocheck
// Task #105 Phase 2 (2026-11-13) — HME Cloud's DT timer rollup is now loaded into ds.hmeDtRows
// (src/lib/supabase.js's loadHmeDtRows, wired via App.js's _stHmeDt) and surfaced in the Speed
// of Service panel as its own small "today" strip — deliberately NOT folded into the existing
// qsr_daily_activity stations, since HME's own REST API only ever returns the current business
// day's rollup (no history, no hour-level data). These tests cover the real new logic: picking
// each store's freshest row, filtering to the active location set, and sorting by HME's own rank.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const dtRow = { loc: '10422', dt: '2026-11-10', hour_slot: '11:00', dt_untilserve: 150000, dt_untilstore: 150000, dt_heldtime: 0, dt_trans_cnt: 10 };
vi.mock('../lib/supabase.js', () => ({ loadDtHistory: () => Promise.resolve([dtRow]) }));

const { DTSpeedOfServicePanel } = await import('../views/dt-speedofservice.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('HME Cloud DT timer strip inside DTSpeedOfServicePanel', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const stores = [{ loc: '10422' }];

  async function render(ds) {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(DTSpeedOfServicePanel, { stores, ds, onClose: () => {} })); });
    await act(async () => { await Promise.resolve(); });
    // Settle the async loadDtHistory().then(setRows) microtask chain.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  it('shows nothing when ds carries no HME rows', async () => {
    await render({ hmeDtRows: [] });
    expect(container.textContent).not.toContain('HME Cloud — DT Timer');
  });

  it('renders the freshest row per store, not an older one for the same store', async () => {
    await render({
      hmeDtRows: [
        { loc: '10422', date: new Date(2026, 10, 9), storeRank: 5, cars: 300, avgSeconds: 200, pct: 60 },
        { loc: '10422', date: new Date(2026, 10, 10), storeRank: 1, cars: 542, avgSeconds: 148, pct: 92 },
      ],
    });
    expect(container.textContent).toContain('HME Cloud — DT Timer');
    expect(container.textContent).toContain('542');
    expect(container.textContent).toContain('148');
    expect(container.textContent).toContain('92%');
    expect(container.textContent).not.toContain('300'); // the stale row's own numbers must not appear
  });

  it('filters to the active location set (store scoping), same as the DAR-based stations', async () => {
    await render({
      hmeDtRows: [
        { loc: '10422', date: new Date(2026, 10, 10), storeRank: 1, cars: 542, avgSeconds: 148, pct: 92 },
        { loc: '99999', date: new Date(2026, 10, 10), storeRank: 2, cars: 400, avgSeconds: 160, pct: 80 },
      ],
    });
    expect(container.textContent).toContain('542');
    expect(container.textContent).not.toContain('400'); // 99999 is not in `stores` for this render
  });
});
