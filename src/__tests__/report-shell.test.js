// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 2 -- renders the REAL ReportShell (criteria bar + Run + export menu),
// not a mock, per this repo's "would this verification still pass if reverted" discipline. A
// minimal caller supplies onRun/getExportData/children, the same contract any real report built
// on the shell uses.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ReportShell, reportScopeLabel } from '../components/ReportShell.js';
import { buildLocationHierarchy } from '../components/PanelControls.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }, { loc: '5183' }];
const INV_ORG_COORDS = { '3708': { state: 'OK', sup: 'Patch A' }, '5183': { state: 'FL', sup: 'Patch B' } };
const STORE_NAMES = { '3708': 'Ardmore', '5183': 'Freeport' };

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ReportShell, props)); });
  return { container, root };
}

describe('reportScopeLabel', () => {
  const tree = buildLocationHierarchy(STORES, INV_ORG_COORDS, STORE_NAMES);
  it('is "AllStores" for the all-level sentinel', () => {
    expect(reportScopeLabel({ level: 'all', id: null }, tree)).toBe('AllStores');
    expect(reportScopeLabel(null, tree)).toBe('AllStores');
  });
  it('is the store\'s own display name for a single-store scope', () => {
    expect(reportScopeLabel({ level: 'store', id: '3708' }, tree)).toContain('Ardmore');
  });
  it('is the state/patch id for those tiers', () => {
    expect(reportScopeLabel({ level: 'state', id: 'OK' }, tree)).toBe('OK');
    expect(reportScopeLabel({ level: 'patch', id: 'Patch A' }, tree)).toBe('Patch A');
  });
});

describe('ReportShell', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('has no export menu until a report has actually run', async () => {
    const onRun = vi.fn();
    ({ container, root } = await mount({
      title: 'Loss Prevention Summary', icon: '🛡️', stores: STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
      onRun, getExportData: () => ({ title: 't', headers: [], rows: [] }), children: null,
    }));
    expect(container.textContent).not.toContain('Export');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('Run passes the resolved date range, the scope label, and the locs for the current selection to onRun', async () => {
    const onRun = vi.fn(async () => {});
    ({ container, root } = await mount({
      title: 'Loss Prevention Summary', stores: STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
      onRun, getExportData: () => ({ title: 't', headers: [], rows: [] }), children: null,
    }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    expect(runBtn).toBeTruthy();
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(onRun).toHaveBeenCalledTimes(1);
    const arg = onRun.mock.calls[0][0];
    expect(arg.scope).toBe('AllStores');
    expect(arg.locs.sort()).toEqual(['3708', '5183']);
    expect(arg.range).toMatchObject({ s: expect.any(String), e: expect.any(String) });
  });

  it('scoping to one store narrows `locs` to just that store before Run (dropdown LocationSelector, owner ask 2026-10-17)', async () => {
    const onRun = vi.fn(async () => {});
    ({ container, root } = await mount({
      title: 'Report', stores: STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, locationMode: 'store',
      onRun, getExportData: () => ({ title: 't', headers: [], rows: [] }), children: null,
    }));
    // ReportShell now renders LocationSelector as a <select> (variant:'dropdown'), not pills --
    // find the option whose text names the store and select it via a real change event.
    const select = [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent.includes('Ardmore')));
    expect(select).toBeTruthy();
    const option = [...select.options].find(o => o.textContent.includes('Ardmore'));
    await act(async () => {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(onRun.mock.calls[0][0].locs).toEqual(['3708']);
    expect(onRun.mock.calls[0][0].scope).toContain('Ardmore');
  });

  it('after a run, the export menu opens and CSV export fires with the real getExportData() contract', async () => {
    const onRun = vi.fn(async () => {});
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({
        title: 'Loss Prevention Summary', stores: STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
        onRun,
        getExportData: () => ({ title: 'Loss Prevention Summary', headers: ['Store', 'Discount %'], rows: [['Ardmore', '2.1%']] }),
        children: null,
      }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      expect(exportBtn).toBeTruthy();
      await act(async () => { exportBtn.click(); });

      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      expect(csvItem).toBeTruthy();
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^LossPreventionSummary_.*_AllStores\.csv$/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('renders the caller\'s children as the report body', async () => {
    ({ container, root } = await mount({
      title: 'Report', stores: STORES, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
      onRun: vi.fn(), getExportData: () => ({ title: 't', headers: [], rows: [] }),
      children: React.createElement('div', null, 'REPORT BODY MARKER'),
    }));
    expect(container.textContent).toContain('REPORT BODY MARKER');
  });
});
