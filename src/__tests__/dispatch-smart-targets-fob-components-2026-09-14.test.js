// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-14): Smart Targets' FOB % row needed its 6 components
// (comp waste / raw waste / condiments / emp-mgr meals / stat variance /
// unexplained) shown, and they need to add up to the Smart FOB % number already
// on screen -- a visible, checkable invariant, not just an approximation.
//
// engine/smart-targets.js's allocateShares() (unit-tested in smart-targets.test.js)
// carries the actual sum-to-1 guarantee. This file covers the two things that
// guarantee alone can't: (1) fobMonthly() actually produces the per-component
// `comps` allocateShares consumes, correctly derived from the raw qsr_fob dollar
// fields, and (2) the wiring in the ACTUAL SmartTargetsPanel -- metric.components,
// the row's `components` field, and the new table columns -- is real, per the
// standing "would this verification still pass if reverted" rule (an engine-only
// test would keep passing even if the view never called allocateShares at all).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { fobMonthly, FOB_COMPONENTS, METRICS } from '../views/smart-targets.js';

describe('fobMonthly — per-component ratios sum exactly to the total (FOB_COMPONENTS)', () => {
  it('comps sum to v, and each comp matches its own dollar-field / sales', () => {
    const rows = [
      { loc: '3708', date: '2026-08-15', prodSalesAmt: 100000, compWasteAmt: 200, rawWasteAmt: 350, condimentsAmt: 2050, empMgrMealsAmt: 200, statVarianceAmt: 1050, unexplainedAmt: 0 },
    ];
    const [pt] = fobMonthly(rows);
    expect(pt.loc).toBe('3708');
    expect(pt.comps.compWaste).toBeCloseTo(200 / 100000, 10);
    expect(pt.comps.rawWaste).toBeCloseTo(350 / 100000, 10);
    expect(pt.comps.condiment).toBeCloseTo(2050 / 100000, 10);
    expect(pt.comps.empFood).toBeCloseTo(200 / 100000, 10);
    expect(pt.comps.statLoss).toBeCloseTo(1050 / 100000, 10);
    expect(pt.comps.unex).toBe(0);
    const sumComps = FOB_COMPONENTS.reduce((a, c) => a + pt.comps[c.key], 0);
    expect(sumComps).toBeCloseTo(pt.v, 12); // EXACT identity, not approximate
  });

  it('collapses cumulative MTD rows to the latest-per-month point, comps included', () => {
    const rows = [
      { loc: '3708', date: '2026-08-01', prodSalesAmt: 30000, compWasteAmt: 60, rawWasteAmt: 100, condimentsAmt: 600, empMgrMealsAmt: 60, statVarianceAmt: 300, unexplainedAmt: 0 },
      { loc: '3708', date: '2026-08-20', prodSalesAmt: 100000, compWasteAmt: 200, rawWasteAmt: 350, condimentsAmt: 2050, empMgrMealsAmt: 200, statVarianceAmt: 1050, unexplainedAmt: 0 },
    ];
    const pts = fobMonthly(rows);
    expect(pts).toHaveLength(1); // only the latest (08-20) row survives
    expect(pts[0].comps.condiment).toBeCloseTo(2050 / 100000, 10);
  });
});

describe('METRICS fob entry — components + officialComponent registry', () => {
  const fob = METRICS.find(m => m.key === 'fob');

  it('declares all 6 FOB_COMPONENTS', () => {
    expect(fob.components).toBe(FOB_COMPONENTS);
    expect(fob.components.map(c => c.key).sort()).toEqual(['compWaste', 'condiment', 'empFood', 'rawWaste', 'statLoss', 'unex'].sort());
  });

  it('officialComponent reads the matching tXxx field, and the 6 sum to tFOBTarget for a real store (3708)', () => {
    const vals = fob.components.map(c => fob.officialComponent(c.key, '3708', {}));
    expect(vals.every(v => typeof v === 'number')).toBe(true);
    const sum = vals.reduce((a, b) => a + b, 0);
    // 3708's DEFAULT_TARGETS: tCompWaste .002 + tRawWaste .0035 + tCondiment .0205
    // + tEmpFood .002 + tStatLoss .0105 + tUnex 0 = .0385 = tFOBTarget exactly.
    expect(sum).toBeCloseTo(0.0385, 10);
  });
});

vi.mock('../lib/supabase.js', () => ({
  loadDailySales: vi.fn(),
  loadGlimpse: vi.fn(),
  loadQsrFob: vi.fn(),
  loadQsrActSummary: vi.fn(),
  loadSmartTargetAdjustments: vi.fn(),
  saveSmartTargetAdjustment: vi.fn(),
  applyOfficialTargets: vi.fn(),
}));

import { loadDailySales, loadGlimpse, loadQsrFob, loadQsrActSummary, loadSmartTargetAdjustments } from '../lib/supabase.js';
import { SmartTargetsPanel } from '../views/smart-targets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const recent = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// 4 monthly qsr_fob points (cumulative-MTD rows, one per month) for store 3708 --
// spread across the trailing 90/42/21-day windows weightedRecencyLevel blends.
function buildFobRows() {
  return [5, 40, 75, 110].map((n, i) => ({
    loc: '3708', date: recent(n), prodSalesAmt: 150000 + i * 2000,
    compWasteAmt: 280 + i * 5, rawWasteAmt: 520 + i * 10, condimentsAmt: 3100 + i * 20,
    empMgrMealsAmt: 290 + i * 5, statVarianceAmt: 1550 + i * 15, unexplainedAmt: 0,
  }));
}

describe('SmartTargetsPanel — real render, FOB % component columns (owner request, 2026-09-14)', () => {
  let container, root;
  beforeEach(() => {
    loadDailySales.mockResolvedValue([]);
    loadGlimpse.mockResolvedValue([]);
    loadQsrActSummary.mockResolvedValue([]);
    loadSmartTargetAdjustments.mockResolvedValue({});
    loadQsrFob.mockResolvedValue(buildFobRows());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.clearAllMocks(); });

  const NOOP = () => {};

  it('selecting FOB % renders the 6 component columns, and they sum to the displayed Smart value for a real row', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });

    // Switch the metric selector to FOB % — the first <select> in the header
    // (metricKey), matched by its FOB option rather than assumed position.
    const metricSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('FOB %')));
    expect(metricSelect, 'metric <select> with a FOB % option not found').toBeTruthy();
    await act(async () => {
      metricSelect.value = 'fob';
      metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(loadQsrFob).toHaveBeenCalled();
    // Component headers present -- would NOT render at all if the components
    // wiring (metric.components / the new <th>/<td> blocks) were reverted.
    for (const c of FOB_COMPONENTS) expect(container.textContent).toContain(c.label);

    const bodyRow = [...container.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('#3708'));
    expect(bodyRow, 'store 3708 row not found once real fob history loaded').toBeTruthy();
    const cells = [...bodyRow.querySelectorAll('td')];
    // Column order: Store, Official, Smart, [6 components], Current, vs Official, ...
    const pct = td => { const m = td.textContent.match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
    const smart = pct(cells[2]);
    expect(smart).not.toBeNull();
    const compVals = cells.slice(3, 9).map(pct);
    expect(compVals.every(v => v != null)).toBe(true);
    const compSum = compVals.reduce((a, b) => a + b, 0);
    // Both are pct2-formatted (2 decimal places); 6 independently-rounded cells
    // can drift from the 1-rounded total by at most a few hundredths -- this is
    // a DISPLAY-rounding tolerance, not slack in the underlying allocation math
    // (which allocateShares' own unit tests already prove is exact).
    expect(Math.abs(compSum - smart)).toBeLessThan(0.03);
  });

  it('component cells carry Official/Current in their tooltip title (hover build-up)', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const metricSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('FOB %')));
    await act(async () => {
      metricSelect.value = 'fob';
      metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const bodyRow = [...container.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('#3708'));
    const compCell = [...bodyRow.querySelectorAll('td')][3]; // Comp Waste
    expect(compCell.title).toContain('official');
    expect(compCell.title).toContain('current');
  });

  it('a metric without components (Sales) renders none of the FOB component headers', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    for (const c of FOB_COMPONENTS) expect(container.textContent).not.toContain(c.label);
  });
});
