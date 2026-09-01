// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (screenshot, EOM Supervisor Rollup / Inventory Control hub, 2026-09-01): the
// "Op Supplies" column showed $78,130 (no decimals) on the Projection row and $72,261 (no
// decimals) on the Actual row, while the +/- and $ Amount rows of that SAME column correctly
// showed 2 decimals (e.g. ($5,869.67)) — an inconsistent column. Owner's exact rule: "make
// target format to 2 decimals please. All dollars and percents should always show 2 decimals
// for reference."
//
// Root cause (src/views/eom-supervisor.js EOMBlock): every other money cell in this table
// (Product Net Sales, +/- row, $ Amount row) goes through a formatter with
// {minimumFractionDigits:2, maximumFractionDigits:2}. The Op Supplies Projection cell and the
// Actual cell's forPrint branch instead did `'$' + Math.round(v).toLocaleString()` — Math.round
// strips to whole dollars and bare toLocaleString() defaults to 0 decimals. Fixed by routing
// both through the same local `salesStr` helper every other dollar cell already uses.
//
// Renders the REAL EOMSupervisorPanel (not an isolated formatter) so this fails if the fix is
// reverted OR if it's applied somewhere the real render doesn't reach ("would this still pass if
// reverted?", CLAUDE.md standing rule). The rollup block is used because EOMSupervisorPanel
// always renders it with forPrint:true regardless of the panel's own print state (see the
// hardcoded `forPrint: true` on the rollup's <EOMBlock> below in the source), so it exercises
// BOTH the always-on Projection cell (line ~477) and the forPrint-gated Actual cell (line ~498)
// without needing to trigger window.print().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Only mock the one export eom-supervisor.js actually reads from lib/supabase.js.
vi.mock('../lib/supabase.js', () => ({
  loadEbosMonthlyByStore: async () => ({ '3708': 72261.35 }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMSupervisorPanel } = await import('../views/eom-supervisor.js');

const LOC = '3708';

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

const ds = {
  allMonthlyTargets: {
    // computeStoreEOM's periodKey is `${selYear}-${selMonth}` — NOT zero-padded (unlike the
    // pmKey used for qsr_fob lookups below) — so August is keyed '2026-8', not '2026-08'.
    '2026-8': {
      [LOC]: {
        tProdSales: 300000,   // non-null so hasTargets is true
        tOpSupply: 78130.4,   // deliberately non-whole — old code rounded this away
      },
    },
  },
};

describe('EOM Supervisor Rollup — Op Supplies column always shows 2 decimals', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('Projection and Actual rows render Op Supplies with exactly 2 decimals, matching the +/- and $ Amount rows in the same column', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      // Flush the loadEbosMonthlyByStore().then(setEbosByLoc) microtask.
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const table = container.querySelector('table');
    expect(table, 'rollup table not found — is the rollup block still forPrint:true by default?').toBeTruthy();

    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const opIdx = headers.indexOf('Op Supplies');
    expect(opIdx).toBeGreaterThan(-1);
    const salesIdx = headers.indexOf('Product Net Sales');

    const rows = [...table.querySelectorAll('tbody tr')];
    const cellAt = (rowIdx, colIdx) => rows[rowIdx].querySelectorAll('td')[colIdx].textContent.trim();

    // Row order: Projection(0), Actual(1), +/-(2), $ Amount(3).
    // Projection row — previously '$78,130' (Math.round + bare toLocaleString).
    expect(cellAt(0, opIdx)).toBe('$78,130.40');
    // Actual row (forPrint branch) — previously '$72,261'.
    expect(cellAt(1, opIdx)).toBe('$72,261.35');

    // Same column's +/- and $ Amount rows were already correct — confirm they still are, and
    // that Projection/Actual now match their decimal precision (the owner's reported symptom
    // was the mismatch WITHIN the column).
    expect(cellAt(2, opIdx)).toMatch(/^\(\$?5,869\.05\)$/); // 78130.40 - 72261.35, shown as a negative variance in parens
    expect(cellAt(3, opIdx)).toMatch(/\.\d{2}\)?$/); // $ Amount row also carries 2 decimals

    // Sanity: Product Net Sales (a column that was never buggy) still shows 2 decimals too —
    // confirms the fix didn't regress an already-correct sibling column.
    expect(cellAt(0, salesIdx)).toBe('$300,000.00');
  });
});
