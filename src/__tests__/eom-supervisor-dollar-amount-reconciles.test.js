// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (screenshot, EOM Supervisor Rollup, 2026-09-01, Durant-US Hwy 70/22 #5985): Total
// Food Cost showed Projection 27.50%, Actual 27.52%, +/- "+0.02%", but the $ Amount cell read
// $135.02 -- not reproducible by hand as "+0.02% x actual sales" ($123.37) or "x projected sales"
// ($133.63) either. The owner's exact ask: "need to know why i am seeing this ... It should be
// $123.37 and calculated vs Actual Sales."
//
// Root cause (src/views/eom-supervisor.js computeStoreEOM): the base WAS already actual sales
// (refSales = actSales || projSales) -- that part was correct. The mismatch was PRECISION: the
// $ Amount multiply used the full-precision unrounded (actual% - projected%) float, while the
// +/- row above it only ever displayed that float rounded to 2 decimals. A ~0.0219% raw diff
// rounds to "+0.02%" on screen but produces $135.02 when multiplied by the full, un-rounded
// $616,861.43 x 0.000218889 -- a figure nobody can reconstruct from what the panel actually shows.
//
// Fix: round the %-point diff to the SAME 2-decimal precision the +/- row displays BEFORE
// multiplying by refSales, and reuse that identical rounded value for both cells, so "displayed
// % x displayed sales" always reproduces the displayed $ Amount exactly. Applies to all three
// %-based columns (Total Food Cost, Food Over Base, Crew Labor) and rolls up correctly since the
// rollup's own $ Amount is a SUM of each store's already-corrected $ figures (computeRollup's
// sumF('fcVar$') etc.), not a separate recompute.
//
// Renders the REAL EOMSupervisorPanel (not an isolated formula) so this fails if the fix is
// reverted or applied somewhere the real render doesn't reach ("would this still pass if
// reverted?", CLAUDE.md standing rule). Uses the rollup block (always forPrint:true, so always
// fully rendered without a click) -- same approach as eom-supervisor-op-supplies-decimals.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMSupervisorPanel } = await import('../views/eom-supervisor.js');

const LOC = '5985';

function fakeSupabaseChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
  };
  return chain;
}
const fakeSupabase = { from: () => fakeSupabaseChain() };

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

// Projections (Monthly Targets) — proj FC% 27.50, proj FOB% 3.85, proj Crew Labor% 20.00.
const ds = {
  allMonthlyTargets: {
    '2026-8': {
      [LOC]: {
        tProdSales: 668158.15,
        tFOBTotal: 27.50,     // proj Total Food Cost %
        tFOBTarget: 3.85,     // proj Food Over Base %
        tCrewLabor: 20.00,    // proj Crew Labor % (DEFAULT_LABOR_BASIS)
        tOpSupply: 5679.34,
      },
    },
  },
  // Actuals, via the manual FOB Report row path (fobRow) — deliberately full-precision, unrounded
  // percentages, matching how a real QSRSoft P&L Food Cost figure carries more than 2 decimals.
  fobRows: [{
    loc: LOC, date: new Date(2026, 7, 15),
    sales: 616861.43,
    pLFoodPct: 27.5218889,  // -> raw diff vs 27.50 = 0.0218889pp, displays "+0.02%"
    fobPct: 3.9312345,      // -> raw diff vs 3.85  = 0.0812345pp, displays "+0.08%"
    laborPct: 20.2599,      // -> raw diff vs 20.00 = 0.2599pp,   displays "+0.26%"
  }],
};

describe('EOM Supervisor Rollup — $ Amount row reconciles with the displayed +/- % (owner report 2026-09-01)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('Total Food Cost / Food Over Base / Crew Labor $ Amount = displayed (rounded) +/- % x actual sales', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const table = container.querySelector('table');
    expect(table, 'rollup table not found').toBeTruthy();
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const idx = (label) => headers.indexOf(label);
    const fcIdx = idx('Total Food Cost'), fobIdx = idx('Food Over Base'), laborIdx = idx('Crew Labor');
    expect(fcIdx).toBeGreaterThan(-1);
    expect(fobIdx).toBeGreaterThan(-1);
    expect(laborIdx).toBeGreaterThan(-1);

    const rows = [...table.querySelectorAll('tbody tr')];
    const cellAt = (rowIdx, colIdx) => rows[rowIdx].querySelectorAll('td')[colIdx].textContent.trim();
    // Row order: Projection(0), Actual(1), +/-(2), $ Amount(3).

    // Total Food Cost: displayed variance rounds to +0.02% (matches the owner's screenshot exactly).
    expect(cellAt(2, fcIdx)).toBe('+0.02%');
    // 0.02% x $616,861.43 actual sales = $123.37 — NOT $135.02 (the pre-fix, full-precision figure)
    // and NOT $133.63 (0.02% x projected sales — confirms the base stays actual sales).
    expect(cellAt(3, fcIdx)).toBe('$123.37');

    // Food Over Base: displayed variance rounds to +0.08%; $ Amount must match 0.08% x actual sales.
    expect(cellAt(2, fobIdx)).toBe('+0.08%');
    expect(cellAt(3, fobIdx)).toBe('$493.49');

    // Crew Labor: displayed variance rounds to +0.26%; $ Amount must match 0.26% x actual sales.
    expect(cellAt(2, laborIdx)).toBe('+0.26%');
    expect(cellAt(3, laborIdx)).toBe('$1,603.84');
  });
});
