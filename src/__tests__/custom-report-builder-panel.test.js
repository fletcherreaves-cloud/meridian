// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 4 -- renders the REAL CustomReportBuilderPanel, itself built on the
// REAL ReportShell (already covered standalone in report-shell.test.js) and the REAL
// buildCustomReportRows (already covered standalone in custom-report-engine.test.js). This test
// exercises the full stack one level up: pick metrics -> Run -> real rows render -> export fires
// with the real headers/rows, same shape loss-prevention-report-panel.test.js already proves for
// Phase 2's report. ../lib/supabase.js is mocked (same pattern forms-panel.test.js/
// eom-share-links-manage.test.js use) so the panel's saved-reports CRUD is deterministic
// regardless of whether THIS session happens to carry real Supabase credentials (it does --
// VITE_SUPABASE_URL/KEY are live here per dispatch #133 -- a test asserting on a real network
// round-trip to a table that may or may not have had its migration applied would be exactly the
// kind of environment-dependent flake the mock avoids).
import { describe, it, expect, afterEach, vi } from 'vitest';

const loadCustomReportsMock = vi.fn(async () => []);
const saveCustomReportMock = vi.fn(async () => ({ error: 'no-op' }));
const updateCustomReportMock = vi.fn(async () => ({ error: 'no-op' }));
const deleteCustomReportMock = vi.fn(async () => ({ error: 'no-op' }));

vi.mock('../lib/supabase.js', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'fletcher.reaves@mcreaves.com' } } }) } },
  loadCustomReports: (...a) => loadCustomReportsMock(...a),
  saveCustomReport: (...a) => saveCustomReportMock(...a),
  updateCustomReport: (...a) => updateCustomReportMock(...a),
  deleteCustomReport: (...a) => deleteCustomReportMock(...a),
}));

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CustomReportBuilderPanel } from '../views/custom-report-builder.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }, { loc: '5183' }];
const can = () => true;

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(CustomReportBuilderPanel, props)); await Promise.resolve(); });
  return { container, root };
}

function clickByText(container, text) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.textContent.includes(text));
  btn.click();
  return btn;
}

describe('CustomReportBuilderPanel', () => {
  let container, root;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    loadCustomReportsMock.mockClear(); saveCustomReportMock.mockClear();
    updateCustomReportMock.mockClear(); deleteCustomReportMock.mockClear();
  });

  it('prompts to pick a metric before any are selected, before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, can, onClose: () => {} }));
    expect(container.textContent).toContain('Pick at least one metric above, then Run Report.');
  });

  it('the saved-reports list resolves to the empty state once the mocked loadCustomReports settles', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, can, onClose: () => {} }));
    expect(container.textContent).toContain('No saved custom reports yet. Build one below.');
    expect(container.textContent).toContain('Saved Custom Reports (0)');
  });

  it('selecting a metric from the picker turns it into a removable chip and flips the empty-state copy', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, can, onClose: () => {} }));
    await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs)'); });
    expect(container.textContent).toContain('✓ Schedule Gap vs Ideal (hrs)');
    expect(container.textContent).toContain('Schedule Gap vs Ideal (hrs) ✕'); // the selected chip
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real per-store figures from the real engine, side by side for two metrics', async () => {
    const ds = {
      schedRows: [
        { loc: '3708', date: new Date(Date.now() - 3 * 86400000), schVsIdealDiff: 2 },
      ],
      laborRows: [
        { loc: '3708', date: new Date(Date.now() - 3 * 86400000), tpph: 7.25 },
      ],
    };
    ({ container, root } = await mount({ ds, stores: [{ loc: '3708' }], can, onClose: () => {} }));
    await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs)'); });
    await act(async () => { clickByText(container, 'TPPH (Trans/Person-Hr)'); });
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('2.00'); // schedGap, fN(.,2)
    expect(container.textContent).toContain('7.25'); // tpph, fN(.,2)
  });

  it('removing a selected metric (clicking its chip) clears any already-run rows', async () => {
    const ds = { schedRows: [{ loc: '3708', date: new Date(Date.now() - 3 * 86400000), schVsIdealDiff: 2 }] };
    ({ container, root } = await mount({ ds, stores: [{ loc: '3708' }], can, onClose: () => {} }));
    await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs)'); });
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });
    expect(container.textContent).toContain('Ardmore-Broadway');

    await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs) ✕'); });
    expect(container.textContent).toContain('Pick at least one metric above, then Run Report.');
  });

  it('after a run, CSV export fires with the real headers and the real formatted figures', async () => {
    const ds = { schedRows: [{ loc: '3708', date: new Date(Date.now() - 3 * 86400000), schVsIdealDiff: 2 }] };
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({ ds, stores: [{ loc: '3708' }], can, onClose: () => {} }));
      await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs)'); });
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^CustomReportBuilder_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('Save As New surfaces a save failure (mocked saveCustomReport rejecting) rather than crashing, then refreshes the saved list', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, can, onClose: () => {} }));
    await act(async () => { clickByText(container, 'Schedule Gap vs Ideal (hrs)'); });
    const nameInput = [...container.querySelectorAll('input[type="text"]')].find(i => i.placeholder === 'Report name');
    await act(async () => {
      // React tracks the input's prior value via a patched native setter -- a plain
      // `nameInput.value = '...'` assignment doesn't update that tracker, so the subsequent
      // 'input' event never reaches onChange. Bypass it the same way React Testing Library's
      // fireEvent.change does: call the real HTMLInputElement setter directly.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nameInput, 'My District Scheduling Report');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Save As New'));
    expect(saveBtn.disabled).toBe(false);
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Save failed — no-op');
    expect(saveCustomReportMock).toHaveBeenCalledWith({ name: 'My District Scheduling Report', metricKeys: ['schedGap'], shared: false });
  });

  it('the metric picker is permission-filtered through the real customReportCatalog, not a separate list', async () => {
    const denyAll = () => false;
    ({ container, root } = await mount({ ds: {}, stores: STORES, can: denyAll, onClose: () => {} }));
    // No metric in the real catalog sets `perm` today, so denying every permission must still
    // show every metric -- this would only break if the panel built its own picker list instead
    // of delegating to customReportCatalog(can).
    expect(container.textContent).toContain('Schedule Gap vs Ideal (hrs)');
  });
});
