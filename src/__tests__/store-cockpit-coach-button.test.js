// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-14 (looking at the Food Cost tab's "COACH" callout): "great opportunity
// to wire this to add to coaching as well. Along with any other like items." store-cockpit.js
// has exactly two VerdictBand('Coach', ...) call sites -- Food Cost (FOB %) and Labor &
// Scheduling (Crew Labor %) -- both get a "🎯 Coach" button that opens the SAME CoachingModal
// (#208) patch-heatmap.js's own "Coach this" already uses, pre-filled with this store's loc and
// the right COACHING_METRICS key, instead of making the user go find the same finding again in
// Patch Heatmap. Renders the REAL exported tabs (not a mock), per this repo's "would this
// verification still pass if reverted" rule -- a test that only checked VerdictBand/
// CoachThisButton in isolation couldn't tell "wired into the real tab" from "built but never
// connected."
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FoodCostCockpitTab, LaborCockpitTab } from '../views/store-cockpit.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORE = { loc: '10422', name: 'Atoka-Mississippi', org: 'MCDOK', t: { tFOBTarget: 0.028, tCrewLabor: 0.235 } };

function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(Component, props)); });
  return { container, root };
}

describe('"🎯 Coach" button on store-cockpit.js VerdictBands', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('Food Cost tab: the Coach button opens CoachingModal pre-filled with this store + fob_total_pct', () => {
    const period = new Date().toISOString().slice(0, 7);
    const row = {
      loc: '0010422', date: period + '-15',
      prodSalesAmt: 100000, compWasteAmt: 500, rawWasteAmt: 400, condimentsAmt: 300,
      empMgrMealsAmt: 200, statVarianceAmt: 700, unexplainedAmt: 100,
    };
    ({ container, root } = mount(FoodCostCockpitTab, { store: STORE, ds: { qsrFobRows: [row] } }));

    const coachBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🎯 Coach');
    expect(coachBtn).toBeTruthy();
    expect(container.textContent).not.toContain('Baseline is auto-captured'); // modal not open yet

    act(() => { coachBtn.click(); });
    // CoachingModal's own mode:'start' subtitle -- proves the modal actually opened, not just a
    // state flag with no visible effect.
    expect(container.textContent).toContain('Baseline is auto-captured');
    // The metric label CoachingModal resolves from COACHING_METRICS['fob_total_pct'] -- proves
    // the RIGHT metric key reached the modal, not a hardcoded or wrong one.
    expect(container.textContent).toMatch(/Coach FOB % \(total\)/);
  });

  it('Labor & Scheduling tab: the Coach button opens CoachingModal pre-filled with labor_pct', () => {
    // A complete Wed-Tue pay week safely in the past (well before "today" in any real test run),
    // same row shape labor-gap-split.test.js's own fixtures use.
    const dates = ['2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10','2026-08-11'];
    const qsrActSummaryRows = dates.map(dt => ({ loc: '10422', date: new Date(dt + 'T00:00:00'), needHrs: 50, actHrs: 52, darSchedHrs: 51 }));
    ({ container, root } = mount(LaborCockpitTab, { store: STORE, ds: { qsrActSummaryRows } }));

    const coachBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🎯 Coach');
    expect(coachBtn).toBeTruthy();

    act(() => { coachBtn.click(); });
    expect(container.textContent).toContain('Baseline is auto-captured');
    expect(container.textContent).toMatch(/Coach Labor %/);
  });

  it('no Coach button (and no crash) while the tab is still in its loading/no-data state', () => {
    ({ container, root } = mount(FoodCostCockpitTab, { store: STORE, ds: null }));
    expect(container.textContent).toContain('Loading');
    expect([...container.querySelectorAll('button')].find(b => b.textContent === '🎯 Coach')).toBeFalsy();
  });
});
