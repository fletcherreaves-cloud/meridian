// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #88 item 1 -- notes-67's "Food Cost date-selector defaults to May 2026" guess (a
// hardcoded '2026-05' literal) was wrong -- every '2026-05' hit in src/ is a comment or
// placeholder. Measured the real cause: qsr_fob (the auto-pulled cloud stream) was queried
// directly against live Supabase and has real, non-zero prod_sales_amt through the current date
// -- the stream does NOT stop in May, ruling out the "data bug wearing a UI costume" branch too.
//
// The actual defect is a RACE in FOBAnalysisPanel (src/views/analytics.js): `months` is computed
// from `fobRowsEff`, which cloud-first-merges `qsrFobRows` (async, starts at `null` = loading) with
// `ds.fobRows` (manual, already present synchronously). The auto-select effect
// (`if(months.length&&!selMonth)setSelMonth(months[0])`) uses `!selMonth` as a run-once guard --
// but on the FIRST render, before the cloud fetch resolves, `months` is computed from manual rows
// ALONE. If a manual upload's last real month predates the cloud stream's coverage (a completely
// ordinary state per the standing "manual sourcing is always temporary" rule), the effect fires
// immediately, locks `selMonth` onto that stale manual month, and the guard then blocks it from
// ever re-firing once the cloud data arrives with a newer month -- even though `months` itself
// updates correctly.
//
// Fix: gate the auto-select on `qsrFobRows !== null` (the cloud fetch having settled, success or
// caught-error-fallback-to-[]) so the FIRST auto-select is computed from complete data.
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

const STORES = [{ loc: '3708' }];

function mkDs(manualMonth) {
  return {
    fobRows: [
      { loc: '3708', date: new Date(`${manualMonth}-15T00:00:00`), sales: 50000,
        compWaste: 0.002, rawWaste: 0.0035, condiment: 0.02, empMeal: 0.002, statVar: 0.01,
        unexplained: 0, fobPct: 0.04, baseFoodPct: 0.04, discCoupon: 0.01, pLFoodPct: 0.28 },
    ],
    wasteRows: [], targets: {}, monthlyTargets: {},
  };
}

// The cloud stream's real, non-zero rows for the current (much later) month -- shaped like a
// real qsr_fob loader row (loadQsrFob's own output shape, camelCased).
function cloudRows(cloudMonth) {
  return [
    { loc: '3708', date: `${cloudMonth}-24`, prodSalesAmt: 232815.14, compWasteAmt: 500,
      rawWasteAmt: 800, condimentsAmt: 4000, empMgrMealsAmt: 400, discountCouponsAmt: 2000,
      statVarianceAmt: 2000, unexplainedAmt: -50, totalBaseFood: 9000 },
  ];
}

describe('FOBAnalysisPanel -- default month survives the cloud-fetch race (dispatch #88 item 1)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null; resolveLoadQsrFob = undefined;
  });

  it('defaults to the CLOUD stream\'s newest month, not a stale manual-upload month locked in before the cloud data arrived', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Manual upload's last real month is May -- the exact shape of the owner's report. Cloud
    // stream's real coverage reaches August (this session's own live measurement against
    // Supabase).
    act(() => {
      root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs('2026-05'), settings: {}, onClose: () => {} }));
    });

    // First render has already committed with the cloud fetch still in flight -- this is the
    // exact window the race exploits. Now let the cloud promise resolve.
    await act(async () => {
      resolveLoadQsrFob(cloudRows('2026-08'));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    // The selected <option>'s value is the source of truth for what selMonth actually resolved
    // to -- not just "August appears somewhere in the DOM" (which the <option> list alone would
    // already satisfy regardless of which one is selected).
    const selectedOption = [...select.options].find(o => o.selected);
    expect(selectedOption.value).toBe('2026-08');
    expect(selectedOption.value).not.toBe('2026-05');
  });

  it('still defaults correctly when the cloud stream has NO newer coverage than manual (no false positive)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs('2026-05'), settings: {}, onClose: () => {} }));
    });

    await act(async () => {
      resolveLoadQsrFob([]); // cloud fetch settles with nothing newer
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const select = container.querySelector('select');
    const selectedOption = [...select.options].find(o => o.selected);
    expect(selectedOption.value).toBe('2026-05');
  });

  // Follow-up (owner-reported 2026-08-24, after the race fix above shipped): "Once the cloud
  // data loads it shows August. Just a delay between the two." The race fix corrected the END
  // state, but the panel's top-level loading gate only fired on genuinely EMPTY data
  // (!fobRowsEff.length) -- while the cloud fetch is in flight, fobRowsEff already falls back to
  // non-empty manual rows, so the full panel rendered immediately with selMonth still '' (unset):
  // the native <select> fell back to displaying its first DOM option (the manual month) as a
  // visual artifact, and computeFOBMetrics's month filter is a no-op on an empty selMonth, so it
  // silently aggregated every manual month instead of scoping to one. Gating the same loading
  // screen on qsrFobRows===null too closes that window -- the panel now waits for the cloud
  // fetch to settle before rendering anything at all.
  it('shows the loading state (not stale manual data) while the cloud fetch is still in flight, even when manual rows already exist', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(h(FOBAnalysisPanel, { stores: STORES, ds: mkDs('2026-05'), settings: {}, onClose: () => {} }));
    });

    // Cloud fetch still unresolved -- qsrFobRows is still null -- even though manual rows exist.
    expect(container.textContent).toContain('Loading FOB data');
    expect(container.querySelector('select')).toBeFalsy();

    await act(async () => {
      resolveLoadQsrFob(cloudRows('2026-08'));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // Once settled, the loading screen is gone and the real panel (with the correct month
    // already selected -- no intermediate May flash to assert against, since it never rendered)
    // is up.
    expect(container.textContent).not.toContain('Loading FOB data');
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    const selectedOption = [...select.options].find(o => o.selected);
    expect(selectedOption.value).toBe('2026-08');
  });
});
