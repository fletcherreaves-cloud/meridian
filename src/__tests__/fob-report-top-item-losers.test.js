// @vitest-environment happy-dom
// @ts-nocheck
// FOB Report ("📊 FOB Report", EOMDashboardPanel) "Top item losers" + masking check.
//
// Found while wiring the case-pack suffix through this panel (backlog-master §6 / Notes 63 §EOM
// Change Monitor step 3): eom-dashboard.js's fobReport useMemo built each store's varRows via
// `.filter(v => v.hasDollars)`. `hasDollars` is a field the MANUAL-UPLOAD parser (eom-parsers.js)
// computes on its own rows -- loadQsrVarianceStat (src/lib/supabase.js), the actual cloud stream
// this useMemo reads, never sets it. So every row from the real data source was silently dropped,
// and grossLoss/grossGain/masking/topItems were always empty/false for every store, always.
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this renders
// the REAL EOMDashboardPanel -> opens the real "📊 FOB Report" modal via the real Reports menu ->
// prints it via the real "⎙ Print (full)" button (which now renders into a same-page overlay
// iframe, see src/utils/print-html.js) -- not an isolated call to buildFobReport()/
// buildStoreFobReport(). A revert of the `v.hasDollars` -> `v.dolDiff != null` fix, or of the
// case-pack suffix wiring, fails this.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';

const PERIOD = periodKey(new Date());

// '3708' = Ardmore-Broadway (MCDOK/OK), same real STORE_NAMES-seeded store dispatch-227's own
// render tests use.
const FOB = [
  { loc: '3708', date: `${PERIOD}-15`, prodSalesAmt: 100000, compWasteAmt: 800, rawWasteAmt: 400, condimentsAmt: 300, empMgrMealsAmt: 100, statVarianceAmt: 2500, unexplainedAmt: 200 },
];
// Shaped exactly like loadQsrVarianceStat's real return value (src/lib/supabase.js) -- no
// `hasDollars` field, since the real cloud stream never carries one. A second item (RJ2) has no
// matching raw-item-info row below, so its case size never resolves.
const VARIANCE = [
  { loc: '3708', wrin: 'RJ1', cls: 'Food', descr: 'Recount Test Item', variance: -150, dolDiff: -300 },
  { loc: '3708', wrin: 'RJ2', cls: 'Food', descr: 'No Case Size Item', variance: -40, dolDiff: -60 },
];
const RAW_ITEM_DETAIL = [
  { loc: '3708', wrin: 'RJ1', descr: 'Recount Test Item', itemClass: 'Food', history: [] },
];
const RAW_ITEM_INFO = [
  { loc: '3708', wrin: 'RJ1', caseQty: 75 },
];

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => [],
  loadQsrFob: async () => FOB,
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => VARIANCE,
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => RAW_ITEM_DETAIL,
  loadQsrRawItemInfo: async () => RAW_ITEM_INFO,
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
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function selectPeriod(container) {
  const sel = container.querySelector('select');
  expect(sel, 'period <select> not found').toBeTruthy();
  await act(async () => {
    sel.value = PERIOD;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

// Reports ▾ / Scans ▾ / Pulls ▾ / Monitor ▾ -- ActionMenu's own label carries a trailing ▼/▲
// glyph (PanelControls.js), so match by prefix rather than exact text.
async function openFobReport(container) {
  const reportsBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  expect(reportsBtn, '"Reports" menu button not found').toBeTruthy();
  await act(async () => { reportsBtn.click(); });
  const fobRepBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '📊 FOB Report');
  expect(fobRepBtn, '"📊 FOB Report" menu item not found').toBeTruthy();
  await act(async () => { fobRepBtn.click(); });
}

// Print no longer opens a real window -- it renders the report into a same-page overlay iframe
// (src/utils/print-html.js). Read the report HTML back from that iframe's own document.
function printedFobReportHtml(container) {
  const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Print (full)'));
  expect(printBtn, '"⎙ Print (full)" button not found').toBeTruthy();
  act(() => { printBtn.click(); });
  const iframes = [...document.querySelectorAll('iframe')];
  const iframe = iframes[iframes.length - 1];
  expect(iframe, 'printHtml overlay iframe not found').toBeTruthy();
  return iframe.contentDocument.documentElement.outerHTML;
}

describe('FOB Report — Top item losers + masking (real varRows source)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    document.querySelectorAll('iframe').forEach(f => f.parentElement && f.parentElement.remove());
  });

  it('a real qsr_variance_stat row (no hasDollars field) reaches the printed report as a top item loser, with its $ figure', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await openFobReport(container);
    const html = printedFobReportHtml(container);
    expect(html).toContain('Top item losers');
    expect(html).toContain('Recount Test Item');
    expect(html).toContain('-$300');
  });

  it('appends the case-pack-converted quantity alongside the $ figure, without replacing it', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await openFobReport(container);
    const html = printedFobReportHtml(container);
    // variance:-150 / caseQty:75 = -2.00 cases.
    expect(html).toContain('Recount Test Item -$300 = 2.00 case(s)');
  });

  it('the on-screen expanded store row shows the same top item loser (not print-only)', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await openFobReport(container);
    // Click the leaf store-name SPAN, not a `div` ancestor -- the outer per-store wrapper div has
    // no onClick of its own (the real handler sits on an inner row div); a leaf span's click
    // bubbles up through the real onClick div correctly (same pattern as this repo's count-cycle
    // render tests).
    const nameSpan = [...container.querySelectorAll('span')].find(s => s.textContent.trim() === 'Ardmore-Broadway');
    expect(nameSpan, 'store-name span not found in the FOB Report modal').toBeTruthy();
    await act(async () => { nameSpan.click(); });
    expect(container.textContent).toContain('Top item losers');
    expect(container.textContent).toContain('Recount Test Item -$300 = 2.00 case(s)');
  });

  it('an item with no matched case-size info (RJ2, no raw-item-info row) renders the $ figure with no case suffix', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await openFobReport(container);
    const html = printedFobReportHtml(container);
    expect(html).toContain('No Case Size Item -$60');
    // Exactly this item's own $ figure, with nothing appended after it before the next item/cell.
    expect(html).not.toMatch(/No Case Size Item -\$60 = /);
  });
});
