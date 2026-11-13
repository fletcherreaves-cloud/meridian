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
  });
});
