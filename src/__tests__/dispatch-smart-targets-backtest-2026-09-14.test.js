// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-14): "we need to build a backtest engine for all the
// Smart Targets metrics to see how we've performed over this year vs actuals as
// well as loaded targets." runMonthlyBacktest() is the pure orchestration: for
// each completed calendar month, per store, what Smart would have recommended
// AS OF that month's start (leak-free), the real Actual for that month, and the
// real Official target that was in effect (via mergedTargetsForLocMonth).
//
// Deliberately reuses the SAME primitives the live view uses for "now" rather
// than a parallel computation, per the standing "two computations disagreeing"
// risk -- these tests exercise it through the real METRICS entries (not a
// hand-rolled fake metric object) so a drift between the live path and this one
// would show up here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { runMonthlyBacktest, METRICS } from '../views/smart-targets.js';

// Build a flat daily series for one store across many months, `valueFn(monthIndex)`
// gives that month's daily value (constant within the month, for a
// predictable, hand-checkable "actual").
function monthlySeries(year, fromMonth, toMonth, valueFn, weight = 1000) {
  const out = [];
  for (let m = fromMonth; m <= toMonth; m++) {
    const days = new Date(year, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      out.push({ d: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, v: valueFn(m), w: weight });
    }
  }
  return out;
}

describe('runMonthlyBacktest — ratio metric (laborpct)', () => {
  const metric = METRICS.find(m => m.key === 'laborpct');
  const ds = {}; // no monthly_targets/yearly workbook -> officialVal falls to DEFAULT_TARGETS via mergedTarget

  it('computes a real Smart (leak-free) and a real Actual for a completed month, for a real store', () => {
    // Store 3708, Jan-Aug 2026, labor% steady at 21% every month (Jan through
    // Jul learning history, backtesting August).
    const series = { 3708: monthlySeries(2026, 1, 8, () => 0.21) };
    const rows = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }]);
    expect(rows).toHaveLength(1);
    const [r] = rows;
    expect(r.loc).toBe('3708');
    expect(r.actual).toBeCloseTo(0.21, 6); // August's own real weighted level
    expect(r.smart).not.toBeNull();
    expect(r.smart).toBeCloseTo(0.21, 2); // steady history -> Smart tracks it closely
    expect(r.official).not.toBeNull(); // DEFAULT_TARGETS['3708'].tCrewLabor via resolveLaborTarget
  });

  it('is leak-free: August\'s Smart number does not change when September data (which shouldn\'t exist yet) is appended', () => {
    const series = { 3708: monthlySeries(2026, 1, 8, () => 0.21) };
    const withFutureLeak = {
      3708: [...series[3708], ...monthlySeries(2026, 9, 9, () => 0.99)], // a wildly different Sept
    };
    const before = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }])[0];
    const after = runMonthlyBacktest(ds, metric, withFutureLeak, [{ y: 2026, m: 8 }])[0];
    expect(after.smart).toBeCloseTo(before.smart, 10);
  });

  it('skips a store/month with no real activity that month (never fabricates a 0)', () => {
    const series = { 3708: monthlySeries(2026, 1, 7, () => 0.21) }; // no August data at all
    const rows = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }]);
    expect(rows).toEqual([]);
  });

  it('skips a store/month with no learning history before the month (no leak-free Smart possible)', () => {
    const series = { 3708: monthlySeries(2026, 8, 8, () => 0.21) }; // only August itself, no prior months
    const rows = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }]);
    expect(rows).toEqual([]);
  });

  it('two stores with different trajectories anchor each other as peers (Smart differs from a plain own-trajectory read)', () => {
    // 3708 trends up toward a higher-performing peer's level; peers ARE
    // supplied even though only 3708 is scored (peer anchoring uses every loc
    // with learning history, not just the ones with a current-month actual).
    const series = {
      3708: monthlySeries(2026, 1, 8, () => 0.25), // consistently high (bad, labor% lower=better)
      5183: monthlySeries(2026, 1, 7, () => 0.19), // a strong peer, similar volume
    };
    const rows = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }]);
    const r3708 = rows.find(r => r.loc === '3708');
    expect(r3708).toBeTruthy();
    // Peer-anchored Smart should be nudged BELOW the flat 0.25 own-trajectory
    // (lower is better for labor%), not simply equal to it.
    expect(r3708.smart).toBeLessThan(0.25);
  });
});

describe('runMonthlyBacktest — monthly metric (sales)', () => {
  const metric = METRICS.find(m => m.key === 'sales');
  const ds = {};

  it('Actual = the real period SUM for the month (not a mean/level)', () => {
    const series = { 3708: monthlySeries(2026, 1, 8, () => 3000) }; // $3000/day flat
    const rows = runMonthlyBacktest(ds, metric, series, [{ y: 2026, m: 8 }]);
    expect(rows).toHaveLength(1);
    const augustDays = new Date(2026, 8, 0).getDate(); // 31
    expect(rows[0].actual).toBeCloseTo(3000 * augustDays, 0);
    expect(rows[0].smart).toBeGreaterThan(0);
  });
});

describe('runMonthlyBacktest — degrades gracefully', () => {
  const metric = METRICS.find(m => m.key === 'laborpct');

  it('empty seriesByLoc / empty months -> empty result, no throw', () => {
    expect(() => runMonthlyBacktest({}, metric, {}, [])).not.toThrow();
    expect(runMonthlyBacktest({}, metric, {}, [])).toEqual([]);
    expect(runMonthlyBacktest({}, metric, { 3708: [] }, [{ y: 2026, m: 8 }])).toEqual([]);
  });
});

vi.mock('../lib/supabase.js', () => ({
  loadDailySales: vi.fn(), loadGlimpse: vi.fn(), loadQsrFob: vi.fn(), loadQsrActSummary: vi.fn(),
  loadSmartTargetAdjustments: vi.fn(), saveSmartTargetAdjustment: vi.fn(), applyOfficialTargets: vi.fn(),
}));

import { loadDailySales, loadSmartTargetAdjustments } from '../lib/supabase.js';
import { SmartTargetsPanel } from '../views/smart-targets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function buildYearOfSales() {
  const rows = [];
  const start = new Date(2025, 8, 1); // well before this year for trailing windows
  const end = new Date();
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    rows.push({ loc: '3708', date: new Date(d), sales: 3000 + (d.getMonth() % 3) * 200 });
  }
  return rows;
}

describe('SmartTargetsPanel — real render, Backtest toggle (owner request, 2026-09-14)', () => {
  let container, root;
  beforeEach(() => {
    loadDailySales.mockResolvedValue(buildYearOfSales());
    loadSmartTargetAdjustments.mockResolvedValue({});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.clearAllMocks(); });

  const NOOP = () => {};

  it('clicking the Backtest button switches to a per-store-per-month table with real numbers', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const btBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Backtest'));
    expect(btBtn, 'Backtest button not found').toBeTruthy();

    await act(async () => {
      btBtn.click();
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('#3708');
    // Real month labels, not a placeholder -- Jan through the last completed month.
    expect(container.textContent).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug/);
  });
});
