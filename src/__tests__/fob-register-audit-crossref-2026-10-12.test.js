// @vitest-environment happy-dom
// @ts-nocheck
// Owner-scoped 2026-10-12: "Cross-reference only, keep named data out of food-cost reports,
// maybe with a clickable link to go to actionable data where names could then be seen if
// desired." FOBAnalysisPanel's Emp/Mgr Meals row (the one FOB component that's also a
// Controls/cash-handling metric) now carries a "→ Register Audit" link, both in single-store
// view and per-store in the district-wide breakdown chips, that calls the new onNav(loc,'register')
// prop. App.js wires onNav to goRoute(null)+goStore(loc,'register'), and StoreDash's new
// initialTab prop seeds its tab state so the link lands directly on the named-employee detail.
//
// Renders the REAL FOBAnalysisPanel and the REAL StoreDash (not just the onNav callback or the
// initialTab prop checked in isolation) per this repo's "would this verification still pass if
// reverted" standing rule — a test that only asserted a prop was passed could pass unchanged with
// the click handler or the tab-seeding deleted.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let resolveLoadQsrFob;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrFob: () => new Promise((resolve) => { resolveLoadQsrFob = resolve; }),
    loadQsrVarianceHistory: async () => [],
    loadDailyActivityRangeForStore: async () => [],
    loadStoreLaborConfig: async () => ({}),
  };
});
// StoreDash's weekly-forecast effect is irrelevant to the initialTab-seeding behavior under
// test (same precedent as dispatch-208's own StoreDash test) -- stubbed to settle synchronously
// so it never runs the real forecastRangeAsync (which needs a fuller ds.targets shape than this
// fixture provides).
vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); } };
});

const { FOBAnalysisPanel } = await import('../views/analytics.js');
const { StoreDash } = await import('../views/store-analytics.js');
const h = React.createElement;

const STORE_A = '3708';
const STORE_B = '5183'; // another real store in DEFAULT_TARGETS (constants.js), distinct from STORE_A
const STORES = [{ loc: STORE_A }, { loc: STORE_B }];

const TARGETS = {
  [STORE_A]: { tCompWaste: 0.01, tRawWaste: 0.01, tCondiment: 0.01, tEmpFood: 0.001, tStatLoss: 0.01,
    tUnex: 0.01, tFOBTarget: 0.03, tFOBBase: 0.25, tDiscCoupPct: 0.05, tFOBTotal: 0.9 },
  [STORE_B]: { tCompWaste: 0.01, tRawWaste: 0.01, tCondiment: 0.01, tEmpFood: 0.001, tStatLoss: 0.01,
    tUnex: 0.01, tFOBTarget: 0.03, tFOBBase: 0.25, tDiscCoupPct: 0.05, tFOBTotal: 0.9 },
};

function mkDs(targets) {
  return { fobRows: [], wasteRows: [], targets, monthlyTargets: {} };
}
function cloudRow(loc, month) {
  return { loc, date: `${month}-20`, prodSalesAmt: 100000,
    compWasteAmt: 500, rawWasteAmt: 500, condimentsAmt: 300, empMgrMealsAmt: 200,
    discountCouponsAmt: 500, statVarianceAmt: 300, unexplainedAmt: 100, totalBaseFood: 25000 };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const byText = (container, tag, text) => [...container.querySelectorAll(tag)].find(e => e.textContent.trim() === text.trim());
const linksByText = (container, text) => [...container.querySelectorAll('span')].filter(e => e.textContent.trim() === text);

describe('FOB → Register Audit cross-reference (2026-10-12, owner-scoped)', () => {
  let container, root;
  beforeEach(() => { try { localStorage.clear(); } catch {} });
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null; resolveLoadQsrFob = undefined;
    try { localStorage.clear(); } catch {}
  });

  it('with no onNav prop, no "→ Register Audit" link renders anywhere (named data stays out unless wired)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: [{ loc: STORE_A }], ds: mkDs(TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob([cloudRow(STORE_A, '2026-09')]); });
    await flush();

    expect(container.textContent).toMatch(/Emp \/ Mgr Meals/);
    expect(linksByText(container, '→ Register Audit').length).toBe(0);
  });

  it('single-store view: clicking "→ Register Audit" on the Emp/Mgr Meals row calls onNav(loc, \'register\') for THAT store', async () => {
    const onNav = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: [{ loc: STORE_A }], ds: mkDs(TARGETS), settings: {}, onClose: () => {}, onNav })); });
    await act(async () => { resolveLoadQsrFob([cloudRow(STORE_A, '2026-09')]); });
    await flush();

    // Default selLoc is 'all' regardless of how many stores are passed -- switch to the single
    // store via the panel's own location <select> to reach the single-store inline-link branch.
    // Two <select>s render (Period, then Location) -- the location one is the last.
    const selects = container.querySelectorAll('select');
    const locSelect = selects[selects.length - 1];
    await act(async () => {
      locSelect.value = STORE_A;
      locSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    const link = linksByText(container, '→ Register Audit')[0];
    expect(link, 'cross-reference link not found in single-store view').toBeTruthy();
    await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith(STORE_A, 'register');
  });

  it('district-wide ("all") view: each store\'s breakdown chip link calls onNav with THAT store\'s own loc, not a fixed one', async () => {
    const onNav = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(TARGETS), settings: {}, onClose: () => {}, onNav })); });
    await act(async () => { resolveLoadQsrFob([cloudRow(STORE_A, '2026-09'), cloudRow(STORE_B, '2026-09')]); });
    await flush();

    // 'all' view: no inline link on the row label itself (selLoc==='all' suppresses it) --
    // expand the row to reveal the per-store breakdown chips, each carrying its own link.
    expect(linksByText(container, '→ Register Audit').length).toBe(0);
    const empMealRow = byText(container, 'td', '🍔Emp / Mgr Meals') || [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('Emp / Mgr Meals'));
    expect(empMealRow, 'Emp/Mgr Meals row not found').toBeTruthy();
    await act(async () => { empMealRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const links = linksByText(container, '→ Register Audit');
    expect(links.length).toBe(2); // one per store in the breakdown

    await act(async () => { links[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { links[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onNav).toHaveBeenCalledTimes(2);
    const calledLocs = onNav.mock.calls.map(c => c[0]).sort();
    expect(calledLocs).toEqual([STORE_A, STORE_B].sort());
    onNav.mock.calls.forEach(c => expect(c[1]).toBe('register'));
  });

  it('OK/FL market roll-up view: no inline link (no single store to land on)', async () => {
    const onNav = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(TARGETS), settings: {}, onClose: () => {}, onNav })); });
    await act(async () => { resolveLoadQsrFob([cloudRow(STORE_A, '2026-09'), cloudRow(STORE_B, '2026-09')]); });
    await flush();

    // Two <select>s render (Period, then Location) -- the location one is the last.
    const selects = container.querySelectorAll('select');
    const locSelect = selects[selects.length - 1];
    expect(locSelect).toBeTruthy();
    await act(async () => {
      locSelect.value = 'ok';
      locSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toMatch(/MCDOK — OK/);
    // Market roll-up is not itself a storeId, so the single-store inline link must not appear
    // (it would have nowhere real to land -- no 'ok' Register Audit tab exists).
    expect(linksByText(container, '→ Register Audit').length).toBe(0);
  });
});

describe('StoreDash initialTab (2026-10-12) — seeds the tab on mount, same lifted-tab pattern as schedTab/planningTab/crewTab/signalsTab', () => {
  let container, root;
  const NOOP = () => {};
  function baseStore(loc) {
    return { loc, name: 'Test Store ' + loc, org: 'MCDOK', gm: null, sup: null, city: 'Testville', state: 'OK', addr: null,
      p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, t2w: null, otHrs: 3, _cov: {} },
      t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.25, tFOBTarget: 0.018, tStatLoss: 0.001 },
      opsScore: 78, ctrlScore: 82, findings: [], pSales: 50000, pLY: 48000 };
  }
  function renderStoreDash(initialTab) {
    const store = baseStore('99999');
    const ds = { loaded: true, storeIds: ['99999'], qsrFobRows: [], qsrActSummaryRows: [], ctrlRows: [], auditRows: [], laborRows: [], opsRows: [], records: {} };
    const dateRange = { s: new Date(2025, 0, 1), e: new Date(2025, 0, 31), label: 'Test Period' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(h(StoreDash, {
        store, ds, settings: { dialedInEnabled: false }, allStores: [store],
        onBack: NOOP, onNav: NOOP, dateRange, userEvents: {}, lockedProjections: {}, onUpdateSettings: NOOP,
        initialTab,
      }));
    });
  }
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null;
  });

  it('with no initialTab prop, still defaults to Overview (no regression for every other caller)', async () => {
    await act(async () => { renderStoreDash(undefined); });
    // Overview-tab-gated content only (the sticky header's own "Period Sales" etc. render on
    // every tab, so isn't a valid Overview-vs-register discriminator).
    expect(container.textContent).toContain('No critical findings for this location');
    expect(container.textContent).not.toContain('No Register Audit data');
  });

  it('initialTab:\'register\' lands directly on the Register Audit tab on first mount, not Overview', async () => {
    await act(async () => { renderStoreDash('register'); });
    await flush();
    expect(container.textContent).not.toContain('No critical findings for this location');
    // RegisterAuditTab's own empty-state copy when auditRows is empty for this store.
    expect(container.textContent).toContain('No Register Audit data');
  });
});
