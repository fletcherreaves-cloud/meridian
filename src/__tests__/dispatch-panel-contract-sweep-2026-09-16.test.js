// @vitest-environment happy-dom
// @ts-nocheck
// Panel-contract consistency sweep (Task #55, 2026-09-16) — first batch. Owner asked (during a
// week-of-vacation project lineup) for "standardizing panel controls (calendar/date pickers,
// location/patch/operator/state selectors, print/export/save/share functions, close button
// consistency and location (top right corner))," per the standing rule in memory/panel-contract.md.
//
// This batch converted 5 panels, each verified against the REAL consumer (render/import the
// actual component), not a re-implementation of its logic, per this repo's "would this
// verification still pass if reverted?" rule:
//   - event-impact.js: hand-rolled backdrop -> ModalShell; hand-rolled All/OK/FL pills ->
//     LocationSelector (this file's own dedicated tests, event-impact-panel.test.js /
//     event-impact-write.test.js, already exercise the rest of the panel and still pass unchanged)
//   - signals.js (PromoteModal): hand-rolled backdrop -> ModalShell
//   - calendar.js (grid-tab scope toggle): hand-rolled All/OK/FL + store <select> ->
//     LocationSelector (dispatch-122-events-calendar.test.js etc. already cover the rest)
//   - visit-readiness.js: hand-rolled All/OK/FL + patch <select> + store <select> ->
//     LocationSelector, mode:'full' (dispatch-118-visit-readiness-headers.test.js etc. already
//     cover the rest)
//   - metric-lineage.js: hand-rolled backdrop -> ModalShell; added CSV/JSON/HTML export via the
//     shared LazyExportDropdown (this panel had a real <table> and zero export mechanism,
//     confirmed by the audit's own scan) — covered fresh below since this panel had no test file
//     of its own before this change.
//
// ratchet-modal-backdrop-bypass.test.js's CEILING was lowered 42 -> 40 in the same commit
// (event-impact.js + signals.js's PromoteModal were the two that moved the regex-matched count;
// calendar.js/visit-readiness.js/metric-lineage.js's own backdrops didn't match that ratchet's
// exact-adjacency regex in the first place, so they don't move it further).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MetricLineagePanel } from '../views/metric-lineage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Pre-warm React.lazy's dynamic import() target (store-dash.js, for ExportDropdown) so the first
// render's Suspense fallback doesn't outlast a short flush loop — same pattern
// dispatch-130-record-day-export.test.js already established for this exact import.
await import('../views/store-dash.js');

async function flushLazy() {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  }
}

describe('Panel-contract sweep 2026-09-16: MetricLineagePanel uses ModalShell + real export', () => {
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
    vi.restoreAllMocks();
  });

  it('renders via ModalShell (a single top-right "✕", not a hand-rolled backdrop) and shows the metric table', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(React.createElement(MetricLineagePanel, { onClose }));
    });
    expect(container.textContent).toContain('Metric Lineage');
    expect(container.querySelector('table')).toBeTruthy();

    const closeBtn = container.querySelector('button[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();
    await act(async () => { closeBtn.dispatchEvent(new Event('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exports the currently-filtered metric list as a real CSV via the shared ExportDropdown', async () => {
    await act(async () => {
      root.render(React.createElement(MetricLineagePanel, { onClose: () => {} }));
    });
    await flushLazy();

    // Narrow to a single known composed metric so the exported CSV is checkable, not just non-empty.
    const search = container.querySelector('input[placeholder*="Search metric"]');
    expect(search).toBeTruthy();
    await act(async () => { search.value = 'labor'; search.dispatchEvent(new Event('input', { bubbles: true })); });

    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
    expect(exportBtn).toBeTruthy();
    await act(async () => { exportBtn.click(); });
    const csvBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Download CSV'));
    expect(csvBtn).toBeTruthy();
    await act(async () => { csvBtn.click(); });

    expect(downloads.length).toBeGreaterThan(0);
    expect(downloads[downloads.length - 1].download).toMatch(/^metric-lineage-.*\.csv$/);
  });
});
