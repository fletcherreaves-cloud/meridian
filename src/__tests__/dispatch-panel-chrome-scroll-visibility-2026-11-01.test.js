// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-01), from a phone screenshot of Inventory Control: "can we make the
// horizontal menu ... scrollable? It is perfectly fine on desktop view, but on phone it extends
// out way past the right side of the screen. Also, the dropdown menus, reports, scans, monitor
// and pulls...let's keep them visible no matter which panel is currently being used. right now it
// shows for Scoreboard > Count Cycle, but for Supervisor Rollup > Count Swings it is not visible."
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PanelChrome } from '../components/PanelChrome.js';
import { ActionMenu } from '../components/PanelControls.js';

const h = React.createElement;

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('PanelChrome — band 3 (actions + tabs) scrolls instead of overflowing', () => {
  it('both the actions group and the tabs group get independent horizontal scroll, not clipped/overflowing', async () => {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(h(PanelChrome, {
        actions: h('button', null, 'Reports ▾'),
        tabs: h('button', null, 'Scoreboard'),
      }));
    });
    const divs = [...container.querySelectorAll('div')];
    const actionsWrap = divs.find(d => d.textContent === 'Reports ▾');
    const tabsWrap = divs.find(d => d.textContent === 'Scoreboard');
    expect(actionsWrap.style.overflowX).toBe('auto');
    expect(actionsWrap.style.minWidth).toBe('0');
    expect(tabsWrap.style.overflowX).toBe('auto');
    expect(tabsWrap.style.minWidth).toBe('0');
    act(() => { root.unmount(); });
    container.remove();
  });

  // Regression (owner screenshot, same day): a Reports▾ dropdown's own items ended up "in a
  // scrollable window that does not expand down" -- root cause was `overflowX:'auto'` set with
  // no explicit `overflowY`, which the CSS spec computes as `auto` on the visible-by-default Y
  // axis too, clipping ActionMenu's absolutely-positioned dropdown (a descendant of this same
  // wrapper) into the wrapper's own small box instead of letting it overlay the page below.
  it('overflowY is pinned to "visible" on both wrapper groups, so only the X axis ever clips/scrolls', async () => {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(h(PanelChrome, {
        actions: h('button', null, 'Reports ▾'),
        tabs: h('button', null, 'Scoreboard'),
      }));
    });
    const divs = [...container.querySelectorAll('div')];
    const actionsWrap = divs.find(d => d.textContent === 'Reports ▾');
    const tabsWrap = divs.find(d => d.textContent === 'Scoreboard');
    expect(actionsWrap.style.overflowY).toBe('visible');
    expect(tabsWrap.style.overflowY).toBe('visible');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('a real ActionMenu rendered as the actions slot still opens and shows its items (not swallowed by the wrapper)', async () => {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(h(PanelChrome, {
        actions: h(ActionMenu, { label: 'Reports', items: [{ label: 'Summary', onClick: () => {} }, { label: 'Detail', onClick: () => {} }] }),
      }));
    });
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
    expect(toggle).toBeTruthy();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const items = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(items).toContain('Summary');
    expect(items).toContain('Detail');
    act(() => { root.unmount(); });
    container.remove();
  });
});

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([{ loc: '3708', wrin: 'f1', descr: 'Food 1', cls: 'Food', onHandAmt: 10, active: true, lastCounted: '2026-10-29' }]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => ['2026-10'],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => [],
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');
const STORES = [{ loc: '3708' }];

describe('EOMDashboardPanel — Reports▾ stays reachable on every tab, not just Scoreboard/Count Cycle', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  async function render() {
    await act(async () => {
      root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }
  const reportsBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  const tabBtn = label => [...container.querySelectorAll('button')].find(b => b.textContent === label);

  it('Reports▾ is visible on Scoreboard (the already-working case)', async () => {
    await render();
    expect(reportsBtn(), 'Reports▾ should show on Scoreboard').toBeTruthy();
  });

  it('Reports▾ stays visible after switching to Supervisor Rollup', async () => {
    await render();
    await act(async () => { tabBtn('Supervisor Rollup').click(); });
    expect(reportsBtn(), 'Reports▾ should still show on Supervisor Rollup').toBeTruthy();
  });

  it('Reports▾ stays visible after switching to Count Swings (one of the 4 report tabs)', async () => {
    await render();
    await act(async () => { tabBtn('Count Swings').click(); });
    expect(reportsBtn(), 'Reports▾ should still show on Count Swings').toBeTruthy();
  });

  it('Reports▾ stays visible on Missing Items and Recount Impact too', async () => {
    await render();
    await act(async () => { tabBtn('Missing Items').click(); });
    expect(reportsBtn(), 'Reports▾ should still show on Missing Items').toBeTruthy();
    await act(async () => { tabBtn('Recount Impact').click(); });
    expect(reportsBtn(), 'Reports▾ should still show on Recount Impact').toBeTruthy();
  });
});
