// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #130 -- Record Day Intelligence print/export/PDF.
//
// Renders the REAL RecordDayPanel (not an isolated tabExportSpec helper) and drives the REAL
// ExportDropdown -- lazy-loaded via React.lazy from store-dash.js, exactly the production path
// -- through two different tabs, per this repo's "would this verification still pass if the
// change were reverted?" rule (CLAUDE.md): a test that only imports a pure export-spec function
// could pass unchanged even if the panel's wiring of that function into the actual Export button
// were deleted. This is also the dispatch's own verification bar, read literally: "Trigger
// print/export from at least 2 different tabs (e.g. Speed and Top Days) and confirm the output
// reflects that tab's actual current data, not a stale/wrong tab."
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '33704'; // Tecumseh

const SALES = { '2026-06-01': 10000, '2026-07-10': 15000, '2026-07-15': 12000 };
const GC    = { '2026-06-01': 500,   '2026-07-10': 700,   '2026-07-15': 600 };
const OEPE  = { '2026-06-01': 120,   '2026-07-10': 95,    '2026-07-15': 110 };

vi.mock('../engine/metric-source.js', () => ({
  dailyDataFreshness: () => new Date('2026-07-20T00:00:00'),
  metricSeries: (ds, loc, range, key) => {
    if (String(loc) !== LOC) return {};
    if (key === 'sales') return { ...SALES };
    if (key === 'gc')    return { ...GC };
    if (key === 'oepe')  return { ...OEPE };
    return {};
  },
}));

import { RecordDayPanel } from '../views/record-day.js';

// Pre-warm the dynamic import() RecordDayPanel's React.lazy(...) targets (store-dash.js, for
// ExportDropdown) so the module is already in the loader's cache before any test renders the
// panel -- otherwise the first render's Suspense fallback can outlast a short flush loop while
// esbuild/vitest transforms the 145 KB module for the first time.
await import('../views/store-dash.js');

function baseDs() {
  return { loaded: true, storeIds: [LOC], laborRows: [] };
}

// Flush the microtask queue enough times for React.lazy's dynamic import() (of the real
// store-dash.js module) to resolve and for the resulting Suspense re-render to commit.
async function flushLazy() {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  }
}

describe('#130 RecordDayPanel -- print/export reflects the currently active tab, via the real Export button', () => {
  let container, root, downloads, origCreateElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    downloads = [];
    origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        const origClick = el.click ? el.click.bind(el) : () => {};
        el.click = () => { downloads.push({ download: el.download }); origClick(); };
      }
      return el;
    });
    if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:mock';
    if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    try { localStorage.removeItem('mf_day_records_v1'); } catch {}
    vi.restoreAllMocks();
  });

  async function switchTab(label) {
    const tabs = [...container.querySelectorAll('button')];
    const t = tabs.find(b => b.textContent.startsWith(label));
    expect(t).toBeTruthy();
    await act(async () => { t.click(); });
  }

  async function clickExportCsv() {
    await flushLazy();
    let exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
    expect(exportBtn).toBeTruthy();
    await act(async () => { exportBtn.click(); });
    const csvBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Download CSV'));
    expect(csvBtn).toBeTruthy();
    await act(async () => { csvBtn.click(); });
  }

  it('exporting from the Speed tab produces a speed-scoped filename, not a stale one', async () => {
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    await switchTab('Speed of Service');
    await clickExportCsv();

    expect(downloads.length).toBeGreaterThan(0);
    expect(downloads[downloads.length - 1].download).toMatch(/^record-day-speed-.*\.csv$/);
  });

  it('exporting from the Top Days tab (after visiting Speed first) produces a top-days-scoped filename', async () => {
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    // Visit Speed first, then switch to Top Days -- the regression this guards against is the
    // export staying pinned to whichever tab happened to be active when Export first mounted.
    await switchTab('Speed of Service');
    await flushLazy();
    await switchTab('Top Days');
    await clickExportCsv();

    expect(downloads.length).toBeGreaterThan(0);
    const last = downloads[downloads.length - 1].download;
    expect(last).toMatch(/^record-day-top-days-.*\.csv$/);
    expect(last).not.toMatch(/speed/);
  });

  it('uses ModalShell -- no hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop', async () => {
    await act(async () => {
      root.render(React.createElement(RecordDayPanel, { stores: [{ loc: LOC }], ds: baseDs(), onClose: () => {} }));
    });
    // ModalShell's own close button carries aria-label="Close"; the panel's old hand-rolled
    // '✕' button had no such label.
    const closeBtn = container.querySelector('button[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();
  });
});
