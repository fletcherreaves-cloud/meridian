// @ts-nocheck
// @vitest-environment happy-dom
// Task #79 Phase 1 — Location Dossier panel render test. Mounts the real LocationDossierPanel,
// picks a real store, clicks Run Report, asserts the real factual-metrics grid and top-findings
// section render from real (mocked-at-the-network-boundary) data.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadStoreDemographics: () => Promise.resolve([]) };
});
vi.mock('../lib/sage-client.js', () => ({ callSageOnce: vi.fn(() => Promise.resolve('Test narrative.')) }));

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

function setSelectValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Location Dossier panel (2026-11-13)', () => {
  it('renders the factual grid and top findings after picking a store and running', async () => {
    const { LocationDossierPanel } = await import('../views/location-dossier.js');
    const stores = [{
      loc: '3708', name: 'Ardmore-Broadway', gm: 'Cinthya Armendariz', sup: 'Zukan Eaves', operator: 'Ryan Thorley',
      findings: [{ t: 'crit', m: 'Labor % over target 3 of last 5 days' }, { t: 'watch', m: 'OEPE trending up' }],
    }];
    const ds = { qsrActSummaryRows: [{ loc: '3708', date: '2026-11-01', sales: 5000, gc: 400, tpph: 5.5 }] };

    mountEl(h(LocationDossierPanel, { ds, stores, onClose: () => {} }));

    // ReportShell renders two <select> dropdowns (date range, then location) -- find the one
    // whose options include the real store, not just the first <select> in the DOM.
    const select = [...container.querySelectorAll('select')].find(s => s.textContent.includes('Ardmore-Broadway'));
    expect(select, 'store dropdown not found').toBeTruthy();
    await act(async () => { setSelectValue(select, 'store:3708'); });

    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Report'));
    expect(runBtn, 'Run Report button not found').toBeTruthy();
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Net Sales');
    expect(container.textContent).toContain('Top Findings');
    expect(container.textContent).toContain('Labor % over target 3 of last 5 days');
    expect(container.textContent).toContain('GM: Cinthya Armendariz');
    // Phase 1.5 visual expansion: the 90-day sparkline column and the big trend charts render.
    expect(container.textContent).toContain('90-Day Trend');
    expect(container.textContent).toContain('TPPH');
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  // Phase 1.5 fix (owner-reported, 2026-11-13, screenshots): FOB %/Prime Cost % ("Labor + FOB %")
  // read permanently blank because the grid was computed ONCE at Run time and frozen into state —
  // a metric fed by a slower-loading stream (qsrFobRows, this app's T2 startup tier) could be
  // null at that exact instant and never update even after the real data arrived moments later.
  // This reproduces exactly that: Run fires while `ds` has no FOB data, then `ds` updates (same
  // object identity pattern App.js's setDs uses -- a new object merging in the new rows) as if
  // the T2 stage had just resolved, with NO second click -- the grid must pick it up on its own.
  it('recomputes live from a later ds update, never freezing a metric blank at Run time', async () => {
    const { LocationDossierPanel } = await import('../views/location-dossier.js');
    const stores = [{ loc: '3708', name: 'Ardmore-Broadway' }];

    function Harness() {
      const [ds, setDs] = React.useState({
        laborRows: [{ loc: '3708', date: '2026-10-20', laborPct: 0.25 }],
      });
      Harness._setDs = setDs;
      return h(LocationDossierPanel, { ds, stores, onClose: () => {} });
    }
    mountEl(h(Harness));

    const select = [...container.querySelectorAll('select')].find(s => s.textContent.includes('Ardmore-Broadway'));
    await act(async () => { setSelectValue(select, 'store:3708'); });
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Report'));
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    // FOB % has no source yet -- reads "no trend data" in its sparkline cell, not a crash.
    expect(container.textContent).toContain('FOB %');

    // Simulate the T2 stage resolving qsrFobRows moments later -- a brand-new ds object, no
    // second "Run" click, same as App.js's setDs(prev => ({...prev, ...patch})).
    await act(async () => {
      Harness._setDs(prev => ({
        ...prev,
        qsrFobRows: [{ loc: '0003708', date: '2026-10-20', compWasteAmt: 10, rawWasteAmt: 5, condimentsAmt: 3, empMgrMealsAmt: 2, statVarianceAmt: 0, unexplainedAmt: 0, prodSalesAmt: 1000 }],
      }));
    });

    // 0.25 laborPct + 0.02 fobPct = 0.27 -- the grid picked up the new stream without a re-Run.
    expect(container.textContent).toContain('27.00%');
  });
});
