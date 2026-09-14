// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-14): add Base Food Cost, Paper Cost, and Disc/Coup as
// Smart Targets metrics -- explicitly NOT feeding into the FOB % calculation
// (that stays exactly the 6 waste/variance components it already was). All
// three read the SAME qsr_fob table FOB % reads, under the same cumulative-
// MTD-row convention, using field names confirmed directly against
// at-a-glance.js's own fobAgg/fobAuto formula (the same one the At-A-Glance
// FOB tile ships) rather than trusted from memory.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { baseFoodMonthly, paperCostMonthly, discCoupMonthly, fobMonthly, METRICS } from '../views/smart-targets.js';

const FIXTURE_ROW = {
  loc: '3708', date: '2026-08-20', prodSalesAmt: 100000,
  totalBaseFood: 29500,
  pnlPaperCostBegin: 1000, pnlPaperCostPurchases: 4200, pnlPaperCostAdjustments: 50,
  pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 100, pnlPaperCostEnd: 1150,
  discountCouponsAmt: 1350,
  // FOB's own 6 components, present on the SAME row -- proves the 3 new
  // metrics don't touch these (fobMonthly's own output must be unaffected).
  compWasteAmt: 200, rawWasteAmt: 350, condimentsAmt: 2050, empMgrMealsAmt: 200, statVarianceAmt: 1050, unexplainedAmt: 0,
};

describe('baseFoodMonthly / paperCostMonthly / discCoupMonthly', () => {
  it('baseFoodMonthly = totalBaseFood / prodSales', () => {
    const [pt] = baseFoodMonthly([FIXTURE_ROW]);
    expect(pt.v).toBeCloseTo(29500 / 100000, 10);
    expect(pt.w).toBe(100000);
  });

  it('paperCostMonthly sums the 6 P&L paper legs (Begin+Purchases+Adjustments+Transfers-Promotions-End) / prodSales', () => {
    const [pt] = paperCostMonthly([FIXTURE_ROW]);
    const expectedAmt = 1000 + 4200 + 50 + 0 - 100 - 1150; // = 4000
    expect(pt.v).toBeCloseTo(expectedAmt / 100000, 10);
  });

  it('discCoupMonthly = discountCouponsAmt / prodSales', () => {
    const [pt] = discCoupMonthly([FIXTURE_ROW]);
    expect(pt.v).toBeCloseTo(1350 / 100000, 10);
  });

  it('none of the 3 new metrics change fobMonthly\'s own output for the same row (FOB % stays exactly the 6 waste/variance components)', () => {
    const [pt] = fobMonthly([FIXTURE_ROW]);
    // Unaffected by totalBaseFood/paper/discountCoupons being present on the row --
    // still just the 6 waste/variance components, matching the pre-existing formula.
    const expectedFobAmt = 200 + 350 + 2050 + 200 + 1050 + 0;
    expect(pt.v).toBeCloseTo(expectedFobAmt / 100000, 10);
  });
});

describe('METRICS registry — basefood/papercost/disccoup entries', () => {
  const byKey = k => METRICS.find(m => m.key === k);

  it('all 3 are registered with the right officialCol (monthly_targets column) and direction', () => {
    for (const [key, officialCol] of [['basefood', 'base_food_pct'], ['papercost', 'paper_cost_pct'], ['disccoup', 'disc_coup_pct']]) {
      const m = byKey(key);
      expect(m, `METRICS entry '${key}' not found`).toBeTruthy();
      expect(m.officialCol).toBe(officialCol);
      expect(m.direction).toBe('lower');
      expect(m.ratio).toBe(true);
    }
  });

  it('officialVal reads the correct DEFAULT_TARGETS field for a real store (3708)', () => {
    expect(byKey('basefood').officialVal('3708', {})).toBe(0.04);     // tFOBBase
    expect(byKey('papercost').officialVal('3708', {})).toBe(0.039);   // tPaperCost
    expect(byKey('disccoup').officialVal('3708', {})).toBe(0.0135);   // tDiscCoupPct
  });

  it('none of the 3 declare `components` -- they do not feed FOB %\'s allocation', () => {
    expect(byKey('basefood').components).toBeUndefined();
    expect(byKey('papercost').components).toBeUndefined();
    expect(byKey('disccoup').components).toBeUndefined();
  });
});

vi.mock('../lib/supabase.js', () => ({
  loadDailySales: vi.fn(), loadGlimpse: vi.fn(), loadQsrFob: vi.fn(), loadQsrActSummary: vi.fn(),
  loadSmartTargetAdjustments: vi.fn(), saveSmartTargetAdjustment: vi.fn(), applyOfficialTargets: vi.fn(),
}));

import { loadQsrFob, loadSmartTargetAdjustments } from '../lib/supabase.js';
import { SmartTargetsPanel } from '../views/smart-targets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const recentISO = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function buildFobFixtureRows() {
  return [10, 40].map(n => ({ ...FIXTURE_ROW, date: recentISO(n) }));
}

describe('SmartTargetsPanel — real render, Base Food Cost / Paper Cost / Disc-Coup selectable (owner request, 2026-09-14)', () => {
  let container, root;
  beforeEach(() => {
    loadQsrFob.mockResolvedValue(buildFobFixtureRows());
    loadSmartTargetAdjustments.mockResolvedValue({});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.clearAllMocks(); });

  const NOOP = () => {};

  it('the metric selector lists all 3 new metrics, and selecting each renders a real row (not the empty-history placeholder)', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const metricSelect = [...container.querySelectorAll('select')][0];
    const optionLabels = [...metricSelect.options].map(o => o.textContent);
    expect(optionLabels).toContain('Base Food Cost %');
    expect(optionLabels).toContain('Paper Cost %');
    expect(optionLabels).toContain('Disc/Coup %');

    for (const [value, label] of [['basefood', 'Base Food Cost %'], ['papercost', 'Paper Cost %'], ['disccoup', 'Disc/Coup %']]) {
      await act(async () => {
        metricSelect.value = value;
        metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
      });
      expect(container.textContent, `${label} should render a real store row, not the empty-history message`).not.toContain('No ' + label.split(' ')[0].toLowerCase());
      expect(container.textContent).toContain('#3708');
      // No component columns for these -- unlike FOB %, they don't render a
      // components breakdown (Comp Waste etc. must not leak in from a stale metric).
      expect(container.textContent).not.toContain('Comp Waste');
    }
  });
});
