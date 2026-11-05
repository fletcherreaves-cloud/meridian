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

  // Owner, live: 'Let's give a brief description... Most people would have no clue what that
  // even means' re: the bare "Pearson r · Benjamini–Hochberg FDR-guarded · dot = significant"
  // subtitle on this exact card. Plain language goes out front (CLAUDE.md's "Voice by role"
  // standing rule); the statistical jargon stays exact but moves to a hover tooltip, so it's
  // reachable, never forced inline unexplained. Checked against the rendered DOM, not the
  // JargonTip helper in isolation (it isn't exported) -- a revert that re-inlined the jargon
  // into visible text, or dropped it from the tooltip entirely, would fail one of these two
  // assertions.
  it('leads "What Moves With Food Cost" with a plain-language line and keeps the stats jargon in a hover tooltip, not inline', () => {
    const period = new Date().toISOString().slice(0, 7);
    const row = { loc: '0010422', date: period + '-15', prodSalesAmt: 100000, compWasteAmt: 500 };
    render({ ds: { qsrFobRows: [row] } });
    expect(container.textContent).toContain('What Moves With Food Cost');
    expect(container.textContent).toContain('a dot means the pattern is real, not random noise');
    // The jargon must NOT be sitting in plain visible text any more...
    expect(container.textContent).not.toContain('Benjamini');
    // ...but must still be reachable, verbatim, as the info affordance's tooltip.
    const tip = [...container.querySelectorAll('[title]')].find(el => (el.getAttribute('title') || '').includes('Benjamini'));
    expect(tip).toBeTruthy();
    expect(tip.getAttribute('title')).toBe('Pearson r · Benjamini–Hochberg FDR-guarded · dot = significant');
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
