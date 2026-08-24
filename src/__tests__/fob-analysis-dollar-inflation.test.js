// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #102 -- FOB Analysis's cloud dollar totals were inflated ~24x. qsr_fob stores ONE ROW
// PER (loc, date) by design (scripts/qsrsoft-pull.mjs upserts on 'loc,date'), but each row's
// dollar fields are a PERIOD-TO-DATE snapshot as of that date -- the same monthly total
// re-published under every date already pulled this month (measured live: 23 byte-identical rows
// for one store across 2026-08-01..23, matching the owner's own QSRSoft export exactly).
// computeFOBMetrics (src/views/analytics.js) summed r.sales and every dollar-weighted component
// ACROSS EVERY ROW instead of taking only the latest snapshot per store, so a district total for
// a month N days in was inflated ~Nx. fobSnapshotByStore (engine/eom-inventory.js) already
// established the "keep the latest row per loc" fix for this same row shape elsewhere (see
// src/__tests__/fob-snapshot.test.js's "FOB 30x guard") -- this test is the mirror-image guard
// for computeFOBMetrics's consumer, FOBAnalysisPanel.
//
// Per CLAUDE.md's "would this verification still pass if reverted?" standing rule, this renders
// the ACTUAL FOBAnalysisPanel component (not an isolated unit test of a helper) against a fixture
// shaped exactly like the real duplicate-row qsr_fob pull, and asserts the on-screen total is a
// single month's worth -- reverting the fix (going back to summing every row) would fail this.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let resolveLoadQsrFob;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQsrFob: () => new Promise((resolve) => { resolveLoadQsrFob = resolve; }),
  };
});

const { FOBAnalysisPanel } = await import('../views/analytics.js');
const h = React.createElement;

const STORES = [{ loc: '3708' }, { loc: '5183' }];

// Real store dollar figures -- store 3708's real MTD-to-date snapshot as of one particular day.
// Every field stays IDENTICAL across all 23 duplicate dates for a given store, exactly matching
// the live-measured qsr_fob shape (dispatch #102: "23 rows... every single one byte-identical").
const SNAPSHOTS = {
  '3708': { prodSalesAmt: 237550.49, compWasteAmt: 975.32, rawWasteAmt: 2500.11, condimentsAmt: 4986.99, empMgrMealsAmt: 800.20, statVarianceAmt: 3900.00, unexplainedAmt: -50, totalBaseFood: 9500 },
  '5183': { prodSalesAmt: 180450.00, compWasteAmt: 620.10, rawWasteAmt: 1900.00, condimentsAmt: 3400.50, empMgrMealsAmt: 500.00, statVarianceAmt: 2100.00, unexplainedAmt: 30, totalBaseFood: 7400 },
};

// 23 daily rows per store (2026-08-01 .. 2026-08-23) -- the SAME snapshot re-published under
// every date, matching the real pull's period-to-date behavior.
function duplicateCloudRows() {
  const out = [];
  for (const loc of Object.keys(SNAPSHOTS)) {
    for (let d = 1; d <= 23; d++) {
      out.push({ loc, date: `2026-08-${String(d).padStart(2, '0')}`, ...SNAPSHOTS[loc] });
    }
  }
  return out;
}

describe('FOBAnalysisPanel -- dispatch #102 dollar-inflation guard', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null; resolveLoadQsrFob = undefined;
  });

  it('shows ONE month\'s worth of Net Sales, not 23x the true total, for stores with 23 duplicate daily snapshot rows', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(h(FOBAnalysisPanel, {
        stores: STORES, ds: { fobRows: [], wasteRows: [], targets: {}, monthlyTargets: {} },
        settings: {}, onClose: () => {},
      }));
    });

    await act(async () => {
      resolveLoadQsrFob(duplicateCloudRows());
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // Correct total: the LATEST snapshot per store, summed once each -- $237,550.49 + $180,450.00
    // = $418,000.49 -> displayed as "$418K" ((totalSales/1000).toFixed(0)).
    // The pre-fix bug would have summed 23 copies of each -> ~$9.6M -> "$9614K".
    const correctTotalK = Math.round((SNAPSHOTS['3708'].prodSalesAmt + SNAPSHOTS['5183'].prodSalesAmt) / 1000);
    const buggyTotalK = correctTotalK * 23;
    expect(correctTotalK).toBe(418);

    expect(container.textContent).toContain('$' + correctTotalK + 'K');
    expect(container.textContent).not.toContain('$' + buggyTotalK + 'K');

    // "2 locations · 2 records" -- one collapsed row per store, not 46 (2 stores x 23 dup rows).
    expect(container.textContent).toContain('2 locations');
    expect(container.textContent).toContain('2 records');
    expect(container.textContent).not.toContain('46 records');
  });

  it('collapses to the latest date when duplicate rows are out of order, and ignores rows outside the selected month', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(h(FOBAnalysisPanel, {
        stores: [{ loc: '3708' }], ds: { fobRows: [], wasteRows: [], targets: {}, monthlyTargets: {} },
        settings: {}, onClose: () => {},
      }));
    });

    await act(async () => {
      resolveLoadQsrFob([
        // Out of order, and one row from a different (earlier, smaller-total) month that must be excluded.
        { loc: '3708', date: '2026-08-10', prodSalesAmt: 100000, compWasteAmt: 100 },
        { loc: '3708', date: '2026-08-23', prodSalesAmt: 237550.49, compWasteAmt: 975.32 }, // latest in August -- the real total
        { loc: '3708', date: '2026-08-05', prodSalesAmt: 100000, compWasteAmt: 100 },
        { loc: '3708', date: '2026-07-31', prodSalesAmt: 999999, compWasteAmt: 9999 }, // prior month -- must be excluded
      ]);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // Auto-select lands on the newest month present (August); assert against that state directly
    // rather than assuming a specific <select> value, since months() sorts descending and August
    // is the only month with real August-dated rows (July would need its own selection).
    const select = container.querySelector('select[value]') || container.querySelector('select');
    // Net sales should reflect the Aug 23 snapshot only ($237,550.49 -> "$238K"), never the July
    // row's $999,999 and never a sum of the three August rows ($437,550.49 -> "$438K").
    expect(container.textContent).toContain('$238K');
    expect(container.textContent).not.toContain('$438K');
    expect(container.textContent).not.toContain('$1238K'); // would-be sum including the July row
  });
});
