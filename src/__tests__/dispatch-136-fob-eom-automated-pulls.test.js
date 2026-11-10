// @vitest-environment happy-dom
// @ts-nocheck
// Task #136 — automate the original Food Cost "End of Month" troubleshooter (fob-eom.js's
// FOBEOMPanel). Variance Stat, On-Hand Inventory, and Inventory Summary & Usage now come
// straight off their existing loaders (loadQsrVarianceStat/loadQsrOnHand/loadQsrInventorySummary);
// Contributors + Total P&L Cost are both derived from qsr_fob (loadQsrFob) via the new
// contributorsFromFobRows/totalPLFromFobRows. Inventory History stays manual-only (no automated
// source exists for it — confirmed, see the PR description).
//
// Per this repo's "would this verification still pass if reverted?" rule, every UI test here
// renders the REAL FOBEOMPanel (not an isolated helper) and reads what it actually puts on
// screen — a revert of the wiring (loaders called but never merged into storeData, or merged but
// a manual upload silently clobbered) would fail these.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import * as XLSX from 'xlsx';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORE = '3708'; // real MCDOK/Oklahoma store (Ardmore-Broadway) — real STORE_NAMES/INV_ORG_COORDS entry.
const PADDED = '0003708';

// Period-aware fixtures. `.default` answers whatever period FOBEOMPanel's own defaultEomPeriod()
// picks today (not hardcoded — the exact cutover isn't re-derived here), so the "auto-populates
// with no upload" test is correct no matter when it runs. A specific 'YYYY-MM' key (set only by
// the period-switch test) takes precedence over `.default` when present.
const VARIANCE_BY_PERIOD = {};
const ONHAND_BY_PERIOD = {};
const SUMMARY_BY_PERIOD = {};
const FOB_BY_PERIOD = {};

function resetFixtures() {
  for (const o of [VARIANCE_BY_PERIOD, ONHAND_BY_PERIOD, SUMMARY_BY_PERIOD, FOB_BY_PERIOD]) {
    for (const k of Object.keys(o)) delete o[k];
  }
}

vi.mock('../lib/supabase.js', () => ({
  loadQsrVarianceStat: ({ period } = {}) => Promise.resolve(VARIANCE_BY_PERIOD[period] || VARIANCE_BY_PERIOD.default || []),
  loadQsrOnHand:       ({ period } = {}) => Promise.resolve(ONHAND_BY_PERIOD[period] || ONHAND_BY_PERIOD.default || []),
  loadQsrInventorySummary: ({ period } = {}) => Promise.resolve(SUMMARY_BY_PERIOD[period] || SUMMARY_BY_PERIOD.default || []),
  loadQsrFob: ({ dates } = {}) => {
    const p = (dates && dates[0]) ? dates[0].slice(0, 7) : null;
    return Promise.resolve(FOB_BY_PERIOD[p] || FOB_BY_PERIOD.default || []);
  },
}));

const { FOBEOMPanel, contributorsFromFobRows, totalPLFromFobRows } = await import('../views/fob-eom.js');

// Two days of qsr_fob rows for one store -- dollar-weighted sum/sum across both days.
// compWaste 50+50=100, rawWaste 30+30=60, condiments 150+150=300, empMeal 20+20=40,
// statVar 80+80=160, unexplained 10+10=20 -> fobDol=680, sumSales=20000 -> 3.40% Food Over Base.
// pnlFoodCost build-up (begin+purchases+adjustments+transfers-promotions-end) = 2500/day x2 =
// 5000 -> 25.00% Total Food Cost.
function fobRow(date) {
  return {
    loc: PADDED, date, prodSalesAmt: 10000,
    compWasteAmt: 50, rawWasteAmt: 30, condimentsAmt: 150, empMgrMealsAmt: 20,
    discountCouponsAmt: 0, statVarianceAmt: 80, unexplainedAmt: 10, totalBaseFood: 4000,
    pnlFoodCostBegin: 2000, pnlFoodCostPurchases: 2000, pnlFoodCostAdjustments: 0,
    pnlFoodCostTransfers: 0, pnlFoodCostPromotions: 0, pnlFoodCostEnd: 1500,
    pnlPaperCostBegin: 0, pnlPaperCostPurchases: 0, pnlPaperCostAdjustments: 0,
    pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 0, pnlPaperCostEnd: 0,
  };
}

function varianceRow(wrin, descr, dolDiff) {
  return { loc: PADDED, period: 'x', wrin, descr, cls: 'Food', rawWaste: 10, compWaste: 5,
    expUsage: 100, actUsage: 150, variance: 50, dolDiff };
}
function onHandRow(wrin, descr) {
  return { loc: PADDED, period: 'x', wrin, descr, cls: 'Food', cases: 2, packs: 1, loose: 0.5,
    totalUnits: 10, unitPrice: 5, onHandAmt: 50, lastCounted: '2026-10-29' };
}

function freshDs() { return { loaded: true, allMonthlyTargets: {} }; }

describe('FOBEOMPanel automated pulls (task #136)', () => {
  let container, root;
  beforeEach(() => { resetFixtures(); });
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function render() {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(FOBEOMPanel, {
        stores: [{ loc: STORE }], ds: freshDs(), settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    // Let the auto-pull effect's Promise.all resolve.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  it('shows Period + Store Scope pickers even with zero files uploaded (the old anyLoaded gate no longer hides them)', async () => {
    await render();
    expect(container.textContent).toMatch(/Period:/);
    expect(container.textContent).toMatch(/Store Scope:/);
    expect(container.querySelector('select')).toBeTruthy();
  });

  it('auto-populates Priority Recount + FOB Status with zero files uploaded, and the manual Upload path is still offered', async () => {
    VARIANCE_BY_PERIOD.default = [varianceRow('99901', 'Test Cheese Slices', -120)];
    ONHAND_BY_PERIOD.default = [onHandRow('99901', 'Test Cheese Slices')];
    FOB_BY_PERIOD.default = [fobRow('2026-01-01'), fobRow('2026-01-02')];
    await render();

    // Variance Stat -> Priority Recount (default tab), auto-sourced, no upload.
    expect(container.textContent).toContain('Test Cheese Slices');
    expect(container.textContent).toContain('99901');

    // Contributors, derived from qsr_fob -> FOB Status bar's two roll-ups.
    expect(container.textContent).toContain('3.40%');  // Food Over Base
    expect(container.textContent).toContain('25.00%'); // Total Food Cost
    // DEFAULT_TARGETS['3708'].tCompWaste is a real, non-null target -- the brief's own
    // "most valuable upgrade over the raw Excel import" -- confirms targets are now populated,
    // not left blank the way an un-augmented auto row would.
    expect(container.textContent).toContain('Tgt: 0.20%');

    // Manual upload is still offered, never removed.
    expect(container.textContent).toContain('+ Add Files');
  });

  it('a manual upload for one field overrides auto for that store, without clobbering the OTHER auto-sourced fields, and survives a later re-render', async () => {
    VARIANCE_BY_PERIOD.default = [varianceRow('99901', 'Test Cheese Slices', -120)];
    ONHAND_BY_PERIOD.default = [onHandRow('99901', 'Test Cheese Slices')];
    FOB_BY_PERIOD.default = [fobRow('2026-01-01'), fobRow('2026-01-02')];
    await render();
    expect(container.textContent).toContain('3.40%'); // auto Food Over Base, before the upload

    // Build a real Contributors workbook naming a deliberately distinctive Food Over Base
    // actual% (10.00%) so the override is unambiguous, and feed it through the REAL hidden
    // file input + FileReader + XLSX.read pipeline (not a mocked onLoad call).
    const aoa = [
      ['Category', 'Target', 'Actual (%)', 'Actual $', 'Difference (%)', 'Difference $'],
      ['Food Over Base', 3.9, 10.0, 12345.67, -6.1, -5000],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([buf], `${STORE}_Contributors_Manual.xlsx`);

    // Reveal the upload zone (it's the "+ Add Files" tab once data has auto-loaded).
    const addFilesTab = [...container.querySelectorAll('button')].find(b => b.textContent === '+ Add Files');
    expect(addFilesTab, '+ Add Files tab button not found').toBeTruthy();
    await act(async () => { addFilesTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput, 'file input not found').toBeTruthy();
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      // FileReader.readAsArrayBuffer resolves via a macrotask in happy-dom, not a microtask --
      // a plain Promise.resolve() flush isn't enough to let onload fire before we assert.
      await new Promise(r => setTimeout(r, 20));
    });

    expect(container.textContent).toContain('10.00%');     // manual Food Over Base now showing
    expect(container.textContent).not.toContain('3.40%');  // auto value no longer the one shown

    // Go back to the Priority Recount tab -- the auto-sourced Variance Stat item for this SAME
    // store must still be there: the manual Contributors upload only overrode `contributors`,
    // not `variance`.
    const recountTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Priority Recount'));
    await act(async () => { recountTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Test Cheese Slices');

    // Trigger an unrelated re-render (opening the Tolerances editor) and confirm the manual
    // override is still showing -- it must not silently revert on the next render pass.
    const tolBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Tolerances'));
    await act(async () => { tolBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('10.00%');
  });

  it('switching the Period selector re-fetches and shows that period\'s own data', async () => {
    const now = new Date();
    const past = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const pastKey = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}`;

    VARIANCE_BY_PERIOD.default = [varianceRow('11111', 'Default-Period Item', -60)];
    VARIANCE_BY_PERIOD[pastKey] = [varianceRow('22222', 'Past-Period Item', -60)];
    await render();
    expect(container.textContent).toContain('Default-Period Item');
    expect(container.textContent).not.toContain('Past-Period Item');

    const sel = container.querySelector('select');
    const opt = [...sel.options].find(o => o.value === pastKey);
    expect(opt, `period option ${pastKey} not found in dropdown`).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setter.call(sel, pastKey);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve(); await Promise.resolve();
    });

    expect(container.textContent).toContain('Past-Period Item');
    expect(container.textContent).not.toContain('Default-Period Item');
  });
});

// Task #137 — On-Hand / Variance Stat freshness badges. FOBEOMPanel already receives `ds` as
// a prop and already fetches both streams' full rows on-demand for this period (above); this
// just adds a small stale-dot badge off the SEPARATE lightweight ds.qsrOnHandFreshnessRows /
// ds.qsrVarianceFreshnessRows probes (stream-freshness.js STREAMS), so a revert of that wiring
// (badge added but never reading the probe, or reading the wrong ds field) fails this.
describe('FOBEOMPanel On-Hand / Variance freshness badges (task #137)', () => {
  let container, root;
  beforeEach(() => { resetFixtures(); });
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function renderWithDs(ds) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(FOBEOMPanel, {
        stores: [{ loc: STORE }], ds, settings: {}, onClose: () => {}, embedded: true,
      }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  it('a fresh On-Hand and Variance probe both render a badge naming the stream', async () => {
    await renderWithDs({ loaded: true, allMonthlyTargets: {},
      qsrOnHandFreshnessRows: [{ date: new Date().toISOString() }],
      qsrVarianceFreshnessRows: [{ date: new Date().toISOString() }] });
    expect(container.textContent).toMatch(/On-Hand: today/);
    expect(container.textContent).toMatch(/Variance: today/);
  });

  it('a stale probe (10 days behind) surfaces its real age, not a false-fresh badge', async () => {
    const stale = new Date(); stale.setDate(stale.getDate() - 10);
    await renderWithDs({ loaded: true, allMonthlyTargets: {},
      qsrOnHandFreshnessRows: [{ date: stale.toISOString() }] });
    expect(container.textContent).toMatch(/On-Hand: 10d ago/);
  });

  it('no probe loaded this session renders neither badge (not a false stale dot) -- distinct from the unrelated "On-Hand Inventory" auto-source tooltip, which always renders', async () => {
    await renderWithDs(freshDs());
    expect(container.textContent).not.toMatch(/On-Hand: /);
    expect(container.textContent).not.toMatch(/Variance: /);
  });
});

describe('contributorsFromFobRows / totalPLFromFobRows (pure, task #136)', () => {
  it('returns null with no sales (never a divide-by-zero)', () => {
    expect(contributorsFromFobRows([{ prodSalesAmt: 0 }], {})).toBeNull();
    expect(totalPLFromFobRows([{ prodSalesAmt: 0 }])).toBeNull();
  });

  it('sums dollars across days (never averages daily percentages) and carries Food Over Base + Total Food Cost roll-ups', () => {
    const rows = [fobRow('2026-01-01'), fobRow('2026-01-02')];
    const targets = { tCompWaste: 0.002, tRawWaste: 0.0035, tCondiment: 0.0205, tEmpFood: 0.002,
      tStatLoss: 0.0105, tUnex: 0.0, tFOBTarget: 0.0385, tFOBTotal: 0.2795 };
    const out = contributorsFromFobRows(rows, targets);
    const fob = out.find(r => r.cat === 'Food Over Base');
    const tfc = out.find(r => r.cat === 'Total Food Cost');
    expect(fob.actPct).toBeCloseTo(0.034, 6);
    expect(tfc.actPct).toBeCloseTo(0.25, 6);
    // diff = target - actual; Food Over Base actual (0.034) is BELOW target (0.0385) -> positive
    // diffDol (favorable), matching fobTolColor's existing diffDol<0-means-over convention.
    expect(fob.diffDol).toBeGreaterThan(0);
    expect(out.map(r => r.cat)).toEqual([
      'Completed Waste', 'Raw Waste', 'Condiments', 'Emp/Mgr Meals', 'Variance Stat',
      'Unexplained', 'Food Over Base', 'Total Food Cost',
    ]);

    const pl = totalPLFromFobRows(rows);
    expect(pl.food.total).toBeCloseTo(0.25, 6);
  });
});
