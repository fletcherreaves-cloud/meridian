// @ts-nocheck
// backlog-open-2026-09-06.md §4 "District View: ... Action Plan missing TPPH" -- re-verified
// 2026-09-07 as the one genuinely-still-open sub-claim of a 4-part compound backlog item (the
// other 3 -- Forecast Table columns, Scorecards->Controls data, Forecast Accuracy "Scheduled
// Projection" -- were already fixed). generatePlan() (store-dash.js) built action items for
// OT/Cash O/S/OEPE/T-Red After/Labor % but never TPPH despite TPPH being a scored metric with
// its own target (t.tTpph) and its own tile on this same panel. This adds the missing rule.
import { describe, it, expect } from 'vitest';
import { generatePlan } from '../views/store-dash.js';

function baseStore(overrides = {}) {
  return {
    p: { laborPct: 0.25, oepe: 175, tpph: 90, cashOSPct: 0.0005, otHrs: 0.5, ...overrides.p },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.25, ...overrides.t },
    findings: [], opsScore: 85, ctrlScore: 85, pSales: 50000, pLY: 48000,
    ...overrides,
  };
}

describe('generatePlan TPPH action item', () => {
  it('flags a TPPH action when TPPH is meaningfully below target (higher-is-better)', () => {
    const store = baseStore({ p: { tpph: 60 }, t: { tTpph: 90 } });
    const plan = generatePlan(store, {});
    const tpphAction = plan.actions.find(a => a.category === 'Labor Productivity');
    expect(tpphAction).toBeTruthy();
    expect(tpphAction.issue).toContain('60.00');
    expect(tpphAction.issue).toContain('90.00');
    expect(tpphAction.target).toBe('≥ 90.00 TPPH');
    expect(tpphAction.gap).toMatch(/33\.3% below target/);
  });

  it('does not flag TPPH when at or near target', () => {
    const store = baseStore({ p: { tpph: 88 }, t: { tTpph: 90 } });
    const plan = generatePlan(store, {});
    expect(plan.actions.find(a => a.category === 'Labor Productivity')).toBeFalsy();
  });

  it('does not flag TPPH when there is no target or no data', () => {
    const noTarget = generatePlan(baseStore({ p: { tpph: 10 }, t: { tTpph: 0 } }), {});
    expect(noTarget.actions.find(a => a.category === 'Labor Productivity')).toBeFalsy();

    const noData = generatePlan(baseStore({ p: { tpph: 0 }, t: { tTpph: 90 } }), {});
    expect(noData.actions.find(a => a.category === 'Labor Productivity')).toBeFalsy();
  });
});
