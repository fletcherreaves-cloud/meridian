// @vitest-environment happy-dom
// @ts-nocheck
// Food Cost "Focus View" (owner-approved reskin pilot, 2026-10-07) — a plain-language first
// read of the SAME metrics/rootCauseItems the Classic table already computes (analytics.js's
// FOBAnalysisPanel). Verifies: (1) the toggle actually swaps the rendered body (not just a
// label, per this repo's own "verification must touch the call site" standing rule), (2) the
// headline names the REAL biggest-dollar driver computed from FOB_COMP/metrics, not an invented
// story, (3) a clean store (nothing over target) gets an honest good-news headline instead of a
// forced bad-news one, (4) the preference persists to localStorage so switching back is a
// setting, never a redeploy.
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
  };
});

const { FOBAnalysisPanel } = await import('../views/analytics.js');
const h = React.createElement;
const STORES = [{ loc: '3708' }];

// Lenient targets on every component EXCEPT condiment, which the cloud row below is crafted to
// blow through by 2 full points ($2,000 at $100k sales) -- an unambiguous single driver.
const LENIENT_TARGETS = {
  '3708': { tCompWaste: 0.01, tRawWaste: 0.01, tCondiment: 0.01, tEmpFood: 0.01, tStatLoss: 0.01,
    tUnex: 0.01, tFOBTarget: 0.03, tFOBBase: 0.25, tDiscCoupPct: 0.05, tFOBTotal: 0.9 },
};
// Same targets but condiment ALSO comfortably under -- the "nothing over" case.
const CLEAN_TARGETS = {
  '3708': { tCompWaste: 0.01, tRawWaste: 0.01, tCondiment: 0.06, tEmpFood: 0.01, tStatLoss: 0.01,
    tUnex: 0.01, tFOBTarget: 0.1, tFOBBase: 0.25, tDiscCoupPct: 0.05, tFOBTotal: 0.9 },
};

function mkDs(targets) {
  return { fobRows: [], wasteRows: [], targets, monthlyTargets: {} };
}
function cloudRows(month) {
  return [
    { loc: '3708', date: `${month}-20`, prodSalesAmt: 100000,
      compWasteAmt: 500, rawWasteAmt: 500, condimentsAmt: 3000, empMgrMealsAmt: 200,
      discountCouponsAmt: 500, statVarianceAmt: 300, unexplainedAmt: 100, totalBaseFood: 25000 },
  ];
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const byText = (container, tag, text) => [...container.querySelectorAll(tag)].find(e => e.textContent.trim() === text.trim());

describe('FOBAnalysisPanel Focus View (2026-10-07 reskin pilot)', () => {
  let container, root;
  beforeEach(() => { try { localStorage.clear(); } catch {} });
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null; resolveLoadQsrFob = undefined;
    try { localStorage.clear(); } catch {}
  });

  it('defaults to Classic, and the toggle actually swaps the rendered body', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(LENIENT_TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob(cloudRows('2026-09')); });
    await flush();

    // Classic's dense table is present by default.
    expect(container.textContent).toMatch(/Click any row to expand location breakdown/);
    expect(container.textContent).not.toMatch(/Why — read top to bottom/);

    const focusBtn = byText(container, 'button', '✨ Focus');
    expect(focusBtn, 'Focus toggle button not found').toBeTruthy();
    await act(async () => { focusBtn.click(); });

    expect(container.textContent).toMatch(/Why — read top to bottom/);
    expect(container.textContent).not.toMatch(/Click any row to expand location breakdown/);

    // Switching back to Classic restores the table.
    const classicBtn = byText(container, 'button', '📋 Classic');
    await act(async () => { classicBtn.click(); });
    expect(container.textContent).toMatch(/Click any row to expand location breakdown/);
  });

  it('names the real biggest-dollar driver (Condiments), not an invented story', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(LENIENT_TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob(cloudRows('2026-09')); });
    await flush();
    await act(async () => { byText(container, 'button', '✨ Focus').click(); });

    expect(container.textContent).toMatch(/Condiments/);
    expect(container.textContent).toMatch(/condiment dispense calibration/);
    expect(container.textContent).toMatch(/\$2,000\.00/);
    // Never a fabricated "portioning, not theft" claim -- that line doesn't exist in this data model.
    expect(container.textContent).not.toMatch(/portioning/i);
    expect(container.textContent).not.toMatch(/theft/i);
  });

  it('gives an honest good-news headline when nothing is over target', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(CLEAN_TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob(cloudRows('2026-09')); });
    await flush();
    await act(async () => { byText(container, 'button', '✨ Focus').click(); });

    expect(container.textContent).toMatch(/Every controllable FOB line is within target/);
    expect(container.textContent).not.toMatch(/Condiments is/);
  });

  it('persists the choice to localStorage, and a fresh mount honors it (reverting is a setting, not a deploy)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(LENIENT_TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob(cloudRows('2026-09')); });
    await flush();
    await act(async () => { byText(container, 'button', '✨ Focus').click(); });
    expect(localStorage.getItem('mf_fob_view_style')).toBe('focus');

    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs(LENIENT_TARGETS), settings: {}, onClose: () => {} })); });
    await act(async () => { resolveLoadQsrFob(cloudRows('2026-09')); });
    await flush();

    expect(container.textContent).toMatch(/Why — read top to bottom/);
  });
});
