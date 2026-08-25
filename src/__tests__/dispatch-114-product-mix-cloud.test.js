// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #114 -- ProductMixPanel (src/views/labor-tools.js) previously only ever read
// ds.pmixData (the manual-upload, per-file, lifetime-cumulative blob with no store/date grain).
// ds.pmixRows -- the real, auto-pulled cloud stream (scripts/qsrsoft-pmix-pull.mjs ->
// qsr_product_mix -> loadPmixRows() -> App.js's configureLazyFill) -- was never read at all.
//
// Renders the REAL ProductMixPanel (not an isolated helper), per this repo's "would this
// verification still pass if reverted?" standing rule: a test that only exercised an
// aggregation helper could pass unchanged with the panel's wiring to it deleted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProductMixPanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Synthetic qsr_product_mix rows, shaped exactly like loadPmixRows()'s real output ──
// (src/lib/supabase.js loadPmixRows: loc, date:Date, item, price, desc, familyGroup,
// soldQty, discQty, promoQty, offerAmt, discAmt, unitFoodCost, unitPaperCost).
// Two real store locs (3708 Ardmore-Broadway, 5183 Chickasha-So 4th) so a store-selector
// switch changes which numbers render, not just which rows are summed over the same total.
function pmixRow(loc, date, item, price, familyGroup, soldQty, discQty) {
  return {
    loc, date: new Date(date + 'T00:00:00'), item, price, desc: 'Item ' + item, familyGroup,
    soldQty, discQty, promoQty: 0, offerAmt: 0, discAmt: discQty * (price * 0.3),
    unitFoodCost: 0.8, unitPaperCost: 0.1,
  };
}
const pmixRows = [
  pmixRow('3708', '2026-08-10', 1, 3.99, 'Sandwiches', 100, 10),
  pmixRow('3708', '2026-08-11', 1, 3.99, 'Sandwiches', 120, 12),
  pmixRow('3708', '2026-08-10', 2, 1.99, 'Beverages', 80, 0),
  pmixRow('5183', '2026-08-10', 3, 2.49, 'Fries', 200, 20),
];

// Manual-upload blob (ds.pmixData) -- the pre-existing shape, untouched by this dispatch.
const pmixData = {
  'Product_Mix_20260601_to_20260630_[3708].xlsx': {
    byFamily: { Combos: { units: 500, disc: 25, items: 10 } },
  },
};

function baseDs(overrides = {}) {
  return { pmixRows: [], pmixData: {}, ...overrides };
}

describe('Dispatch #114 -- ProductMixPanel reads ds.pmixRows (cloud) alongside ds.pmixData (manual)', () => {
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

  async function renderPanel(ds) {
    await act(async () => {
      root.render(React.createElement(ProductMixPanel, { stores: [], ds, settings: {}, onClose: () => {} }));
    });
  }

  it('with both sources present, defaults to the Cloud tab (auto-first, freshest-wins) and renders real per-store pmixRows data', async () => {
    await renderPanel(baseDs({ pmixRows, pmixData }));
    // Cloud tab is active by default -- Ardmore-Broadway (3708, alphabetically first) selected.
    const storeSelect = container.querySelector('select');
    expect(storeSelect).toBeTruthy();
    expect(storeSelect.value).toBe('3708');
    expect(container.textContent).toMatch(/Ardmore-Broadway/);
    // 3708's two families: Sandwiches (100+120=220 units), Beverages (80 units).
    expect(container.textContent).toMatch(/Sandwiches/);
    expect(container.textContent).toMatch(/220/);
    expect(container.textContent).toMatch(/Beverages/);
    // 5183's Fries data must NOT appear while 3708 is selected -- confirms per-store filtering,
    // not a district-wide sum across all pmixRows.
    expect(container.textContent).not.toMatch(/Fries/);
    // Manual-only family (Combos, from ds.pmixData) must not leak into the cloud view.
    expect(container.textContent).not.toMatch(/Combos/);
  });

  it('switching the store selector re-aggregates to the OTHER store\'s real cloud rows', async () => {
    await renderPanel(baseDs({ pmixRows, pmixData }));
    const storeSelect = container.querySelector('select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(storeSelect, '5183');
      storeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toMatch(/Chickasha-So 4th/);
    expect(container.textContent).toMatch(/Fries/);
    expect(container.textContent).toMatch(/200/); // Fries units
    expect(container.textContent).not.toMatch(/Sandwiches/);
  });

  it('cloud tab surfaces item-level detail (Top Items) that the manual rollup cannot carry', async () => {
    await renderPanel(baseDs({ pmixRows, pmixData }));
    expect(container.textContent).toMatch(/Top Items/);
    expect(container.textContent).toMatch(/Item 1/); // desc for item #1 (Sandwiches)
  });

  it('Manual tab still renders the pre-existing ds.pmixData experience unchanged (additive, not replaced)', async () => {
    await renderPanel(baseDs({ pmixRows, pmixData }));
    const manualBtn = [...container.querySelectorAll('button')].find(b => /Manual/.test(b.textContent));
    expect(manualBtn).toBeTruthy();
    await act(async () => { manualBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Manual view: the lifetime-cumulative Combos family from ds.pmixData, no store selector.
    expect(container.textContent).toMatch(/Combos/);
    expect(container.textContent).toMatch(/500/);
    expect(container.textContent).toMatch(/Files Loaded/);
    // Cloud-only content (store selector, Top Items) must not be present on the Manual tab.
    expect(container.querySelector('select')).toBeFalsy();
    expect(container.textContent).not.toMatch(/Top Items/);
  });

  it('with ONLY manual data (no cloud rows), defaults to the Manual tab -- unchanged pre-dispatch behavior', async () => {
    await renderPanel(baseDs({ pmixRows: [], pmixData }));
    expect(container.textContent).toMatch(/Combos/);
    expect(container.textContent).toMatch(/☁ Cloud \(none\)/);
  });

  it('with NO data at all, shows the original empty state on the (default) Manual tab', async () => {
    await renderPanel(baseDs());
    expect(container.textContent).toMatch(/No Product Mix Data Loaded/);
    expect(container.textContent).toMatch(/Load Product Mix files/);
  });

  it('Cloud tab with no rows for the selected range/store shows a cloud-specific empty state, not the manual one', async () => {
    await renderPanel(baseDs({ pmixRows: [] , pmixData: {} }));
    const cloudBtn = [...container.querySelectorAll('button')].find(b => /Cloud/.test(b.textContent));
    await act(async () => { cloudBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/No Cloud Product Mix Data/);
    expect(container.textContent).not.toMatch(/Load Product Mix files/);
  });
});
