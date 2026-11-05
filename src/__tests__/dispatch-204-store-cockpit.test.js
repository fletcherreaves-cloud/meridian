// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #204 -- Store Cockpit's two new tabs (Food Cost, Labor & Scheduling) were verified
// live against real Supabase data (see the PR body), which proves the ENGINES compute correctly
// -- it does not prove the REACT COMPONENTS actually render that data, per this repo's standing
// "would this verification still pass if the change were reverted?" rule (dispatch16,
// 2026-08-17): a test that only imports the engine can't tell "wired in" from "wired in but the
// component silently swallows it." This file mounts the REAL exported FoodCostCockpitTab/
// LaborCockpitTab (not a mock), both in their no-data loading/empty branches and with minimal
// fixture data that exercises the real engines end to end.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FoodCostCockpitTab, LaborCockpitTab } from '../views/store-cockpit.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORE = { loc: '10422', name: 'Atoka-Mississippi', org: 'MCDOK', t: { tFOBTarget: 0.028, tCrewLabor: 0.235 } };

describe('FoodCostCockpitTab (dispatch #204)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  // Deliberately does NOT test the ds.qsrFobRows:[] fallback-fetch path -- this dev sandbox has
  // real VITE_SUPABASE_URL/ANON_KEY set (this session's own live-verification credentials), so
  // that branch calls the REAL loadQsrFob() against production Supabase, and its resolution
  // timing depends on live network round-trip rather than anything this test controls -- exactly
  // the kind of environment-dependent behavior that would pass here and differ in CI (where those
  // vars are typically unset, making supabase null and the same call resolve synchronously).
  // The loading-state and populated-data cases below both avoid it (ds:null needs no fetch attempt
  // at all; a non-empty ds.qsrFobRows short-circuits the effect before it fires).
  function render(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(FoodCostCockpitTab, { store: STORE, ds: null, ...props })); });
  }

  it('shows a loading state, not a crash, when ds is not yet loaded', () => {
    render({ ds: null });
    expect(container.textContent).toContain('Loading');
  });

  it('renders a real hero FOB% and driver bars from real qsr_fob rows, via the real buildStoreFobReport engine', () => {
    const period = new Date().toISOString().slice(0, 7);
    const row = {
      loc: '0010422', date: period + '-15',
      prodSalesAmt: 100000, compWasteAmt: 500, rawWasteAmt: 400, condimentsAmt: 300,
      empMgrMealsAmt: 200, statVarianceAmt: 700, unexplainedAmt: 100,
    };
    render({ ds: { qsrFobRows: [row] } });
    // FOB% = (500+400+300+200+700+100)/100000 = 2.2%, sourced through the real engine, not a
    // hand-rolled sum here -- if buildStoreFobReport's own wiring breaks, this renders '—' or a
    // different number, not this exact string. 2.2% is UNDER the 2.8% target fixture, so this
    // also exercises the "under target / savings" branch, not just the over-target one.
    expect(container.textContent).toContain('2.20%');
    expect(container.textContent).toContain('-0.60pp');
    // Variance Stat ($700) is the largest single component -- must appear as the #1 driver row,
    // in the engine's own real label text (not a guessed label).
    expect(container.textContent).toMatch(/Variance Stat/i);
  });
});

describe('LaborCockpitTab (dispatch #204)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  function render(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(LaborCockpitTab, { store: STORE, ds: null, ...props })); });
  }

  it('shows a loading state, not a crash, when ds is not yet loaded', () => {
    render({ ds: null });
    expect(container.textContent).toContain('Loading');
  });

  it('shows the no-complete-week message when ds has no qsrActSummaryRows for this store', () => {
    render({ ds: { qsrActSummaryRows: [] } });
    expect(container.textContent).toMatch(/No complete pay week/i);
  });
});

// ── Coach box threshold redesign (2026-11-05) — see src/engine/labor-gap-split.js's
// laborCoachVerdict for the formula. These render the REAL LaborCockpitTab, not the pure engine
// function alone, per this repo's "would this verification still pass if the change were
// reverted" rule — a test only against laborCoachVerdict (see labor-gap-split.test.js) couldn't
// tell "the component actually reads settings.laborCoachHrsPerDay" from "it ignores the prop and
// always uses the default."
describe('LaborCockpitTab "Coach" box threshold (dispatch: configurable ±hrs/day coaching threshold)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  const dates = ['2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10','2026-08-11'];
  const weekOf = (needHrs, actHrs, darSchedHrs) =>
    dates.map(dt => ({ loc: '10422', date: new Date(dt + 'T00:00:00'), needHrs, actHrs, darSchedHrs }));

  function render(qsrActSummaryRows, settings) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(LaborCockpitTab, { store: STORE, ds: { qsrActSummaryRows }, settings })); });
  }

  it('within the default ±10 hrs/day guideline (70 hrs/week): "On track", no coaching direction picked', () => {
    // planGap = (51-50)*7 = 7, execGap = (52-51)*7 = 7 — both well under 70.
    render(weekOf(50, 52, 51));
    expect(container.textContent).toContain('On track');
    expect(container.textContent).not.toMatch(/not the shift|not the schedule/);
  });

  it('only the planning gap exceeds the guideline: "schedule, not the shift"', () => {
    // planGap = (63-50)*7 = 91 (over 70), execGap = (65-63)*7 = 14 (under 70).
    render(weekOf(50, 65, 63));
    expect(container.textContent).toMatch(/schedule.*not the shift/);
    expect(container.textContent).toContain('91.0 hrs/week');
    expect(container.textContent).toContain('14.0 hrs');
  });

  it('only the execution gap exceeds the guideline: "Execution, not the schedule"', () => {
    // planGap = (51-50)*7 = 7 (under 70), execGap = (65-51)*7 = 98 (over 70).
    render(weekOf(50, 65, 51));
    expect(container.textContent).toMatch(/Execution.*not the schedule/);
    expect(container.textContent).toContain('98.0 hrs/week');
  });

  it('BOTH gaps exceed the guideline: neither "tracks the guide" framing — both named as off', () => {
    // planGap = (65-50)*7 = 105 (over), execGap = (85-65)*7 = 140 (over, the larger piece).
    render(weekOf(50, 85, 65));
    expect(container.textContent).toContain('Both outside');
    expect(container.textContent).not.toMatch(/tracks the guide/);
  });

  it('a per-tenant settings.laborCoachHrsPerDay overrides the 10/day default', () => {
    // planGap = (51-50)*7 = 7, execGap = (52-51)*7 = 7 — within-tolerance at the 10/day
    // default (see first test), but at hrsPerDay=0.5 the band is 0.5*7=3.5, which 7 exceeds.
    render(weekOf(50, 52, 51), { laborCoachHrsPerDay: 0.5 });
    expect(container.textContent).not.toContain('On track');
    expect(container.textContent).toMatch(/±0\.5 hrs\/day/);
  });
});
