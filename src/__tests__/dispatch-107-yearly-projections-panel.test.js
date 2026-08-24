// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #107 Part 2 — the Planning > Yearly panel (YearlyProjectionsPanel) previously
// showed ONLY a Sales rollup derived from monthly_targets; it never read ds.targets (the
// real uploaded yearly-targets workbook: OEPE/Park/KVS/R2P, Voice OSAT/EAD/B2B/1-800,
// Digital App/McDelivery, People staffing+turnover, Labor/FOB) at all.
//
// Renders the REAL YearlyProjectionsPanel (not an isolated helper), per this repo's "would
// this verification still pass if reverted?" standing rule -- a test that only asserted on
// YEARLY_CATS or a data-shaping helper could pass unchanged with the panel's tab/table never
// wired up to it. Clicks the real "Target Categories" tab button and asserts real values
// appear in the rendered DOM.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// yearly-projections.js's Sales Pace view calls loadDailySales() from src/lib/supabase.js on
// mount -- stub it so the render never touches a real (or even mocked) supabase client. The
// Target Categories view under test reads ds directly, not this loader.
vi.mock('../lib/supabase.js', () => ({ loadDailySales: () => Promise.resolve([]) }));

const { YearlyProjectionsPanel } = await import('../views/yearly-projections.js');

const YEAR = 2026;
const ds = {
  targets: {
    '3708': { tOepe: 140, tOsatB2B: 0.02, tDigAppPct: 0.18, tHeadcount: 52, tTpph: 5.6, tLabor: 0.22 },
  },
  allYearlyTargets: {
    [YEAR]: {
      '3708': { tOepe: 140, tOsatB2B: 0.02, tDigAppPct: 0.18, tHeadcount: 52, tTpph: 5.6, tLabor: 0.22 },
    },
  },
};

describe('#107 Part 2: Planning > Yearly panel renders the real yearly-target categories', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('Sales Pace view still renders by default (existing behavior preserved)', async () => {
    await act(async () => {
      root.render(React.createElement(YearlyProjectionsPanel, { ds, stores: [], settings: {}, onClose: () => {}, embedded: true }));
    });
    expect(container.textContent).toMatch(/Sales Pace/);
    expect(container.textContent).toMatch(/Target Categories/);
    // Sales-only rollup is what used to be the ENTIRE panel -- still present, un-broken.
    expect(container.textContent).toMatch(/Annual Target/);
  });

  it('Target Categories tab surfaces real per-store OEPE/CSAT/Digital/People/Labor-FOB values, not just Sales', async () => {
    await act(async () => {
      root.render(React.createElement(YearlyProjectionsPanel, { ds, stores: [], settings: {}, onClose: () => {}, embedded: true }));
    });
    const btn = [...container.querySelectorAll('button')].find(b => /Target Categories/.test(b.textContent));
    expect(btn).toBeTruthy();
    await act(async () => { btn.click(); });

    // Default sub-tab is Service & Ops -- OEPE PACE (140s) should be visible for store 3708.
    expect(container.textContent).toMatch(/OEPE PACE/);
    expect(container.textContent).toMatch(/140s/);

    // Switch to the CSAT sub-tab and confirm the yearly-only OSAT B2B field (2.00%) renders --
    // this is the exact field dispatch #107 Part 4 uses to verify Performance Review wiring,
    // and it is real here because it comes from parseYearlyTargets()'s own field name (tOsatB2B).
    const csatBtn = [...container.querySelectorAll('button')].find(b => /CSAT/.test(b.textContent));
    await act(async () => { csatBtn.click(); });
    expect(container.textContent).toMatch(/OSAT B2B/);
    expect(container.textContent).toMatch(/2\.00%/);
  });

  it('shows the empty-state message for a year with no yearly-targets upload, not a crash', async () => {
    await act(async () => {
      root.render(React.createElement(YearlyProjectionsPanel, { ds: { targets: {}, allYearlyTargets: {} }, stores: [], settings: {}, onClose: () => {}, embedded: true }));
    });
    const btn = [...container.querySelectorAll('button')].find(b => /Target Categories/.test(b.textContent));
    await act(async () => { btn.click(); });
    expect(container.textContent).toMatch(/No yearly targets uploaded/);
  });
});
