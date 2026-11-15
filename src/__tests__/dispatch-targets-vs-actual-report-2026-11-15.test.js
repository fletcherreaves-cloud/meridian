// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-11-15): "a new report that focuses solely on the monthly targets and
// daily targets (separate tabs) that shows clearly what the current target is vs the actual
// results. For the date picker, seed it with 7,14,21 & 28 day options plus MTD please."
//
// Engine tests use the REAL fixture shape proven by fob-reference-table-panel.test.js (same
// 30-day September data for store 3708) so the FOB-leg delta-reconstruction math is exercised
// exactly the same way that already-shipped report exercises it, not a re-derived shortcut.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';
import { resolveDatePreset, MTD_PRESET, DATE_RANGE_PRESETS } from '../components/PanelControls.js';
import {
  effectiveMonthlyTarget, targetStatus, computeTargetsVsActual,
  MONTHLY_TARGET_METRICS, DAILY_TARGET_METRICS,
} from '../engine/targets-vs-actual.js';
import { TargetsVsActualReportPanel } from '../views/targets-vs-actual-report.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const STORES = [{ loc: LOC }];

function buildDs() {
  const qsrFobRows = [];
  const laborRows = [];
  const opsLaborRows = [];
  const ebosRows = [];
  for (let day = 1; day <= 30; day++) {
    const iso = `2026-09-${String(day).padStart(2, '0')}`;
    qsrFobRows.push({
      loc: '0003708', date: iso, prodSalesAmt: 10000 * day, compWasteAmt: 150 * day,
      rawWasteAmt: 100 * day, condimentsAmt: 80 * day, empMgrMealsAmt: 40 * day,
      statVarianceAmt: 60 * day, unexplainedAmt: 10 * day, discountCouponsAmt: 120 * day,
      totalBaseFood: 4000 * day, pnlFoodCostPurchases: 2800 * day, pnlPaperCostPurchases: 350 * day,
    });
    const d = new Date(iso + 'T00:00:00');
    laborRows.push({ loc: LOC, date: d, sales: 10000, gc: 1000, tpph: 5.5 });
    opsLaborRows.push({ loc: LOC, date: d, laborDollar: 2100 });
    ebosRows.push({ loc: LOC, date: d, opsPurchases: 80 });
  }
  return { qsrFobRows, laborRows, opsLaborRows, ebosRows, storeIds: [LOC], allMonthlyTargets: {} };
}

const RANGE = { s: '2026-09-01', e: '2026-09-30' };

describe('PanelControls: MTD preset', () => {
  it('resolves to [1st of the month, last closed business day]', () => {
    // Noon on the 15th: the business day doesn't close until 4am the 16th, so the last
    // CLOSED business day is still the 14th — same ABC-cutover rule every other preset here
    // already follows (lastClosedBusinessDay(), CLAUDE.md's "signature #4").
    const r = resolveDatePreset('mtd', [MTD_PRESET], new Date('2026-09-15T12:00:00'));
    expect(r.s).toBe('2026-09-01');
    expect(r.e).toBe('2026-09-14');
  });

  it('is additive — the shared DATE_RANGE_PRESETS list is untouched', () => {
    expect(DATE_RANGE_PRESETS.find(p => p.id === 'mtd')).toBeUndefined();
  });
});

describe('targetStatus()', () => {
  it('a store beating its target (lower-is-better) is ok even if not exact', () => {
    expect(targetStatus(0.21, 0.19, 'lower')).toBe('ok');
  });
  it('a small miss within ~10% relative is watch', () => {
    expect(targetStatus(5.6, 5.5, 'higher')).toBe('watch'); // 1.8% short
  });
  it('a large miss is a miss', () => {
    expect(targetStatus(0.04, 0.40, 'lower')).toBe('miss'); // 10x over target
  });
  it('a near-zero target (e.g. tUnex: 0.0) uses an absolute, not relative, threshold', () => {
    expect(targetStatus(0, 0.005, 'lower')).toBe('watch');
    expect(targetStatus(0, 0.05, 'lower')).toBe('miss');
  });
  it('missing target or actual is none', () => {
    expect(targetStatus(null, 5, 'higher')).toBe('none');
    expect(targetStatus(5, null, 'higher')).toBe('none');
  });
});

describe('effectiveMonthlyTarget()', () => {
  it('falls back to DEFAULT_TARGETS when no monthly override exists', () => {
    const t = effectiveMonthlyTarget(LOC, '2026-9', {});
    expect(t.tProdSales).toBe(DEFAULT_TARGETS[LOC].tProdSales);
  });
  it('a real monthly override wins field-by-field over DEFAULT_TARGETS', () => {
    const t = effectiveMonthlyTarget(LOC, '2026-9', { '2026-9': { [LOC]: { tProdSales: 999999 } } });
    expect(t.tProdSales).toBe(999999);
    expect(t.tCrewLabor).toBe(DEFAULT_TARGETS[LOC].tCrewLabor); // untouched field still falls back
  });
});

describe('computeTargetsVsActual() — monthly tab', () => {
  it('computes real target-vs-actual rows reusing fob-reference.js\'s own proven resolvers', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: RANGE, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    expect(rows).toHaveLength(1);
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));

    expect(byKey.salesAmt.actual).toBe(300000); // 30 days * $10,000
    expect(byKey.salesAmt.target).toBe(DEFAULT_TARGETS[LOC].tProdSales);

    // Σ laborDollar (2100*30) / Σ sales (10000*30) = 0.21 exactly — matches tCrewLabor (0.21)
    // exactly, so this metric is a clean 'ok'.
    expect(byKey.crewLaborPct.actual).toBeCloseTo(0.21, 6);
    expect(byKey.crewLaborPct.status).toBe('ok');

    expect(byKey.tpph.actual).toBeCloseTo(5.5, 6);
    expect(byKey.tpph.target).toBe(5.6);
    expect(byKey.tpph.status).toBe('watch');

    // Same FOB fixture fob-reference-table-panel.test.js already proves resolves compWaste to
    // exactly 1.50% in every window (150/10000) — baseFoodPct here is 4000/10000 = 40%, badly
    // over the 4% target.
    expect(byKey.baseFoodPct.actual).toBeCloseTo(0.40, 6);
    expect(byKey.baseFoodPct.target).toBe(0.04);
    expect(byKey.baseFoodPct.status).toBe('miss');
  });

  it('every MONTHLY_TARGET_METRICS entry\'s targetField is a real DEFAULT_TARGETS field', () => {
    for (const m of MONTHLY_TARGET_METRICS) {
      expect(DEFAULT_TARGETS[LOC][m.targetField]).not.toBeUndefined();
    }
  });
});

describe('computeTargetsVsActual() — daily tab', () => {
  it('reads DEFAULT_TARGETS directly (no monthly override lookup) and degrades to actual:null without ops data', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'daily', range: RANGE });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.oepe.target).toBe(DEFAULT_TARGETS[LOC].tOepe);
    expect(byKey.oepe.actual).toBeNull();
    expect(byKey.oepe.status).toBe('none');
  });

  it('every DAILY_TARGET_METRICS key is distinct from every MONTHLY_TARGET_METRICS key', () => {
    const monthlyKeys = new Set(MONTHLY_TARGET_METRICS.map(m => m.key));
    for (const m of DAILY_TARGET_METRICS) expect(monthlyKeys.has(m.key)).toBe(false);
  });
});

// The fixture's rows are all dated September 2026; ReportShell's own default date range
// (whatever preset is active) resolves against the REAL clock at test-run time, which won't
// land anywhere near September — so every test that needs real (non-"—") actuals has to steer
// the report's own date-range control to a custom range first, exactly like a user would.
async function setCustomRange(container, s, e) {
  const select = [...container.querySelectorAll('select')].find(sel => [...sel.options].some(o => o.value === 'mtd'));
  const setSelectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setSelectValue.call(select, 'custom');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const [startInput, endInput] = [...container.querySelectorAll('input[type="date"]')];
  const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setInputValue.call(startInput, s);
    startInput.dispatchEvent(new Event('input', { bubbles: true }));
    setInputValue.call(endInput, e);
    endInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const applyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Apply');
  await act(async () => { applyBtn.click(); });
}

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(TargetsVsActualReportPanel, props)); });
  return { container, root };
}

describe('TargetsVsActualReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state, and the date picker carries 7/14/21/28/MTD', () => {
    ({ container, root } = mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
    const select = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mtd'));
    expect(select, 'date-range select with an MTD option not found').toBeTruthy();
    const optionValues = [...select.options].map(o => o.value).filter(v => v !== 'custom');
    expect(optionValues).toEqual(['7d', '14d', '21d', '28d', 'mtd']);
  });

  it('Run Report renders the Monthly tab by default, with real target/actual numbers', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Sales $');
    expect(container.textContent).toMatch(/\$300,000/);
  });

  it('switching to the Daily tab renders the daily metric set instead', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const dailyTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Daily Targets'));
    await act(async () => { dailyTabBtn.click(); });

    expect(container.textContent).toContain('OEPE (sec)');
    expect(container.textContent).not.toContain('Sales $');
  });

  it('after a run, CSV export fires for the active tab', async () => {
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...document.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^TargetsvsActual_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
