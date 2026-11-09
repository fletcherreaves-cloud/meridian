// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-09: "We should pass the scoreboard to view to all levels upwards when
// they deep dive their stores." Shift Scoreboard (task #122) was only reachable via Curated
// Home's own format picker, gated to altitude==='store' (see curated-home-shift-scoreboard.test
// .js's "is never offered at patch or district altitude") -- so a district/patch/supervisor
// altitude drilling into one specific store had no path to it at all. StoreDash
// (src/views/store-analytics.js) is the one per-store deep-dive page every altitude's "click a
// store" already lands on (App.js's goStore/selStore, role-agnostic -- StoreDash itself takes
// no role prop), so a new tab there reaches every altitude by construction, not by listing them.
//
// Renders the REAL StoreDash (not just the tabs array or a prop check) per this repo's "would
// this verification still pass if the change were reverted" standing rule, same precedent as
// fob-register-audit-crossref-2026-10-12.test.js's own StoreDash test.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const loadUserSettingMock = vi.fn().mockResolvedValue(null);
const saveUserSettingMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadUserSetting: (...args) => loadUserSettingMock(...args),
    saveUserSetting: (...args) => saveUserSettingMock(...args),
    loadQsrFob: async () => [],
    loadQsrVarianceHistory: async () => [],
    loadDailyActivityRangeForStore: async () => [],
    loadStoreLaborConfig: async () => ({}),
  };
});
// Same precedent as fob-register-audit-crossref-2026-10-12.test.js's own StoreDash test --
// StoreDash's weekly-forecast effect is irrelevant to which tab renders, stubbed to settle
// synchronously instead of running the real forecastRangeAsync against an incomplete fixture.
vi.mock('../engine/forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); } };
});

const { StoreDash } = await import('../views/store-analytics.js');
const h = React.createElement;
const NOOP = () => {};

function baseStore(loc, name) {
  return { loc, name, org: 'MCDOK', gm: null, sup: null, city: 'Testville', state: 'OK', addr: null,
    p: { laborPct: 0.28, oepe: 175, tpph: 5, cashOSPct: 0.0005, t2w: null, otHrs: 3, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.25, tFOBTarget: 0.018, tStatLoss: 0.001 },
    opsScore: 78, ctrlScore: 82, findings: [], pSales: 50000, pLY: 48000 };
}

describe('StoreDash — Shift Scoreboard tab (dispatch 2026-11-09, deep-dive-from-any-altitude)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = null; root = null; });

  async function render(initialTab) {
    const store = baseStore('3708', 'Ardmore-Broadway');
    const ds = { loaded: true, storeIds: ['3708'], qsrFobRows: [], qsrActSummaryRows: [], ctrlRows: [], auditRows: [], laborRows: [], opsRows: [], records: {} };
    const dateRange = { s: new Date(2025, 0, 1), e: new Date(2025, 0, 31), label: 'Test Period' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(h(StoreDash, {
        store, ds, settings: { dialedInEnabled: false }, allStores: [store],
        onBack: NOOP, onNav: NOOP, dateRange, userEvents: {}, lockedProjections: {}, onUpdateSettings: NOOP,
        initialTab,
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }

  it('offers a "Shift Scoreboard" tab alongside the pre-existing "Shift Analysis" tab (distinct features, not a rename)', async () => {
    await render(undefined);
    const tabLabels = [...container.querySelectorAll('.tab')].map(t => t.textContent);
    expect(tabLabels.some(l => l.includes('Shift Scoreboard'))).toBe(true);
    expect(tabLabels.some(l => l.includes('Shift Analysis'))).toBe(true);
  });

  it('initialTab:\'scoreboard\' lands directly on the real ShiftScoreboardFormat for this store, not Overview', async () => {
    await render('scoreboard');
    // Overview-only copy must be absent; the real scoreboard renders this store's own name
    // (not a placeholder) plus its Customize control, same assertions
    // curated-home-shift-scoreboard.test.js uses against the same component reached the other way.
    expect(container.textContent).not.toContain('No critical findings for this location');
    expect(container.textContent).toContain('Ardmore-Broadway');
    const customize = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Customize'));
    expect(customize).toBeTruthy();
  });

  it('clicking the Shift Scoreboard tab from Overview switches to it (reachable with no initialTab, same as every other tab)', async () => {
    await render(undefined);
    const tab = [...container.querySelectorAll('.tab')].find(t => t.textContent.includes('Shift Scoreboard'));
    expect(tab).toBeTruthy();
    await act(async () => { tab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('Customize'))).toBe(true);
  });
});
