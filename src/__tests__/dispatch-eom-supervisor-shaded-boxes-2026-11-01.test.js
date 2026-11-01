// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-11-01: "on the Supervisor Rollup, we are soooo close! Can you fix the math
// for the Amount Shaded and total of shaded boxes. The only items being calculated for this (and
// the only boxes needing to be actually shaded) is Food Over Base, Crew Labor and Ops Supplies."
//
// computeRollup()/computeStoreEOM()'s totalShaded math was ALREADY correct (owner directive
// 2026-08-04, same 3-metric formula) -- the real bug was the $ Amount row's VISUAL shading:
// Total Food Cost and OT $ were colored with the same red/amber/green colShaded() scale as the
// 3 counted boxes, even though neither is folded into the total. That mismatch is exactly the
// "so close" confusion -- a user sees 5 colored boxes and reasonably assumes all 5 count.
//
// Renders the REAL EOMSupervisorPanel (rollup block, always forPrint:true) so this fails if the
// fix is reverted or the color-vs-total mismatch is reintroduced anywhere else ("would this
// still pass if reverted?", CLAUDE.md standing rule) -- not just a style-object unit check.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const LOC = '5985';

vi.mock('../lib/supabase.js', () => ({
  // actOpSup comes from the eBOS monthly lookup -- $9,000 actual vs the $5,679.34 target below
  // gives a real, large, RED-under-colShaded opSup$ ($3,320.66) to prove it's still actually
  // shaded, not just happening to read muted because the value is small.
  loadEbosMonthlyByStore: async () => ({ [LOC]: 9000 }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMSupervisorPanel } = await import('../views/eom-supervisor.js');

function fakeSupabaseChain() {
  const chain = {
    select: () => chain, eq: () => chain,
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

// Same proj/actual fixture as eom-supervisor-dollar-amount-reconciles.test.js (the known-good
// $123.37 / $493.49 / $1,603.84 figures for Total Food Cost / Food Over Base / Crew Labor), plus
// an OT $ source (ds.laborRows) and the eBOS Op Supplies mock above.
const ds = {
  allMonthlyTargets: {
    '2026-8': {
      [LOC]: { tProdSales: 668158.15, tFOBTotal: 27.50, tFOBTarget: 3.85, tCrewLabor: 20.00, tOpSupply: 5679.34 },
    },
  },
  fobRows: [{
    loc: LOC, date: new Date(2026, 7, 15), sales: 616861.43,
    pLFoodPct: 27.5218889, fobPct: 3.9312345, laborPct: 20.2599,
  }],
  laborRows: [{ loc: LOC, date: new Date(2026, 7, 15), otDollar: 5000 }],
};

describe('EOM Supervisor Rollup — only Food Over Base / Crew Labor / Op Supplies are shaded (owner report 2026-11-01)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('Total Food Cost and OT $ render muted (unshaded) even when their values would be red/amber under the shaded scale', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const table = container.querySelector('table');
    expect(table, 'rollup table not found').toBeTruthy();
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const idx = (label) => headers.indexOf(label);
    const fcIdx = idx('Total Food Cost'), fobIdx = idx('Food Over Base'), laborIdx = idx('Crew Labor'),
          otIdx = idx('OT Hours'), opSupIdx = idx('Op Supplies');
    [fcIdx, fobIdx, laborIdx, otIdx, opSupIdx].forEach(i => expect(i).toBeGreaterThan(-1));

    const rows = [...table.querySelectorAll('tbody tr')];
    const cellAt = (rowIdx, colIdx) => rows[rowIdx].querySelectorAll('td')[colIdx];
    const amtRow = 3; // Projection(0), Actual(1), +/-(2), $ Amount(3)

    const MUTED = '#6b7280';
    const SHADED_COLORS = ['#ef4444', '#f59e0b', '#10b981']; // red, amber, green

    // Confirm these two carry real, non-trivial values (so "muted" isn't trivially true from a
    // blank cell) -- both would be amber/red under colShaded if still mistakenly shaded.
    expect(cellAt(amtRow, fcIdx).textContent.trim()).toBe('$123.37');
    expect(cellAt(amtRow, otIdx).textContent.trim()).toBe('$5,000.00');

    expect(cellAt(amtRow, fcIdx).style.color).toBe(MUTED);
    expect(cellAt(amtRow, otIdx).style.color).toBe(MUTED);
    expect(SHADED_COLORS).not.toContain(cellAt(amtRow, fcIdx).style.color);
    expect(SHADED_COLORS).not.toContain(cellAt(amtRow, otIdx).style.color);

    // The 3 real boxes ARE still shaded (not accidentally muted too).
    expect(cellAt(amtRow, fobIdx).style.color).toBe('#f59e0b');   // $493.49 -> amber
    expect(cellAt(amtRow, laborIdx).style.color).toBe('#ef4444'); // $1,603.84 -> red
    expect(cellAt(amtRow, opSupIdx).style.color).toBe('#ef4444'); // $3,320.66 -> red
  });

  it('Total of Shaded Boxes sums ONLY Food Over Base + Crew Labor (New Total) + Op Supplies — excludes Total Food Cost and OT $', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // fobVar$ 493.49 + laborNewTotal 1603.84 (no xfers/unclocked) + opSup$ 3320.66 = 5417.99.
    // NOT 123.37 (fcVar$) + 5000 (otDollar) higher — those two must be absent from this sum.
    expect(container.textContent).toContain('Total of Shaded Boxes:');
    expect(container.textContent).toContain('$5,417.99');
    expect(container.textContent).not.toContain('$10,541.86'); // what it would read if fc+ot were wrongly folded in
  });
});
