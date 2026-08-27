// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #170 — Product Mix Cloud tab "never populates, waited several minutes" (owner report).
// Renders the REAL ProductMixPanel through the REAL metric-source.js lazy-fill wiring (not a
// pre-seeded ds, which is what dispatch-114-product-mix-cloud.test.js's suite does — that suite
// still holds and is unaffected by this dispatch, since it bypasses ensureLazyFill entirely). Per
// this repo's "would this verification still pass if reverted?" rule: a test has to exercise
// `ensureLazyFill('pmixRows')` / `ensureLazyFillWide('pmixRows')` actually firing from the panel's
// own effects, or it can't tell "the loader default is bounded" from "the loader default is
// bounded but the panel still asks for the old unbounded one."
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProductMixPanel } from '../views/labor-tools.js';
import { configureLazyFill, _resetLazyFillForTests } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function pmixRow(loc, date, item, soldQty) {
  return { loc, date: new Date(date + 'T00:00:00'), item, price: 3.99, desc: 'Item ' + item, familyGroup: 'Sandwiches', soldQty, discQty: 0, promoQty: 0, offerAmt: 0, discAmt: 0, unitFoodCost: 0.8, unitPaperCost: 0.1 };
}
// 40 days of bounded rows (what the NEW narrow default returns).
const narrowRows = Array.from({ length: 40 }, (_, i) => pmixRow('3708', `2026-07-${String(18 + i).padStart(2, '0')}`, 1, 10 + i)).filter(() => true);
// A wide history spanning ~237 days (what the WIDE tier returns — mirrors dispatch #169's own
// Filet-O-Fish anchor scale, 2026-01-01..2026-08-26).
function buildWideRows() {
  const rows = [];
  const start = new Date('2026-01-01T00:00:00');
  for (let i = 0; i < 237; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    rows.push(pmixRow('3708', d.toISOString().slice(0, 10), 1, 5 + (i % 7)));
  }
  return rows;
}
const wideRows = buildWideRows();

describe('ProductMixPanel Cloud tab populates within a bound (dispatch #170)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    _resetLazyFillForTests();
  });

  // A tiny host component owning REAL ds state, wired to metric-source.js's real lazy-fill hook
  // exactly like App.js does — so ProductMixPanel's own `ensureLazyFill('pmixRows')` effect is
  // what drives the load, not a value handed in by the test.
  function Host({ narrowLoader, wideLoader }) {
    const [ds, setDs] = React.useState({ pmixRows: undefined, pmixData: {} });
    // Configured synchronously during render, not inside a useEffect: React flushes passive
    // effects child-before-parent, so a Host-level useEffect here would still fire AFTER
    // ProductMixPanel's own mount effect (its ensureLazyFill('pmixRows') call) in the same
    // initial commit -- the hook would be null when the panel asks for it. In the real app this
    // ordering issue never surfaces because App.js's configureLazyFill effect flushes once at
    // startup, long before a later-opened panel like this one ever mounts. configureLazyFill
    // itself is a plain, idempotent module-level assignment (metric-source.js) -- safe to call
    // every render.
    configureLazyFill({ setDs, loaders: { pmixRows: narrowLoader }, wideLoaders: { pmixRows: wideLoader } });
    return React.createElement(ProductMixPanel, { stores: [], ds, settings: {}, onClose: () => {} });
  }

  // ProductMixPanel's `dataSrc` initializer reads `hasCloudPMix` at mount time, which is always
  // false the instant a lazy-fill source starts loading (documented in the panel's own header
  // comment) -- so the panel opens on the Manual tab and the caller clicks Cloud themselves, same
  // as a real user would. This is pre-existing, unrelated-to-this-dispatch behavior (dispatch-114-
  // product-mix-cloud.test.js's own "with ONLY manual data... defaults to the Manual tab" case) --
  // reproduced here rather than routed around, since routing around it wouldn't be reproducing the
  // real click-driven path the owner actually experiences.
  function clickCloudTab() {
    const cloudBtn = Array.from(container.querySelectorAll('button')).find(b => /Cloud/.test(b.textContent));
    act(() => { cloudBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }

  it('the default (30D) view populates once the BOUNDED loader resolves — a fixed, small number of ticks, not "eventually"', async () => {
    let resolveNarrow;
    const narrowLoader = vi.fn(() => new Promise(res => { resolveNarrow = res; }));
    const wideLoader = vi.fn(() => new Promise(() => {})); // never resolves — must not be needed for the default view

    await act(async () => {
      root.render(React.createElement(Host, { narrowLoader, wideLoader }));
    });
    // On mount, the panel's own effect must have called ensureLazyFill('pmixRows') -- the
    // BOUNDED loader -- exactly once, regardless of which tab is showing.
    expect(narrowLoader).toHaveBeenCalledTimes(1);
    clickCloudTab();
    expect(container.textContent).toMatch(/Loading Product Mix…/);

    // Resolve the bounded loader -- this is the ENTIRE fix: the default view no longer depends
    // on the wide/unbounded fetch at all. The panel's own pmixPending state clears via a 300ms
    // poll (ProductMixPanel, labor-tools.js) against isLazyFillPending, not a ds-change reaction
    // -- a fixed, short, real wait, not an unbounded "eventually".
    await act(async () => { resolveNarrow(narrowRows); await new Promise(r => setTimeout(r, 350)); });
    expect(container.textContent).not.toMatch(/Loading Product Mix…/);
    expect(container.textContent).toMatch(/Sandwiches/);
    expect(container.textContent).not.toMatch(/No Cloud Product Mix Data/);
    // The wide loader must never have been invoked for the plain 30D default view.
    expect(wideLoader).not.toHaveBeenCalled();
  });

  it('selecting 180D does NOT render the bounded 40-day data under the "180D" label — shows a genuine loading state instead (range options must not lie)', async () => {
    const narrowLoader = vi.fn(() => Promise.resolve(narrowRows));
    let resolveWide;
    const wideLoader = vi.fn(() => new Promise(res => { resolveWide = res; }));

    await act(async () => { root.render(React.createElement(Host, { narrowLoader, wideLoader })); });
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    clickCloudTab();
    expect(container.textContent).toMatch(/Sandwiches/); // bounded default view is up

    const range180Btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '180D');
    expect(range180Btn).toBeTruthy();
    await act(async () => { range180Btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // Must show the wide-load-pending state, not silently keep showing the 40-day-bounded chart
    // mislabeled as "180D".
    expect(wideLoader).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Loading Full History…/);

    await act(async () => { resolveWide(wideRows); await new Promise(r => setTimeout(r, 350)); });
    expect(container.textContent).not.toMatch(/Loading Full History…/);
    expect(container.textContent).toMatch(/Sandwiches/);
  });

  it('a failed wide fetch surfaces an explicit error state on 180D/All, not a silent narrow-data fallback', async () => {
    const narrowLoader = vi.fn(() => Promise.resolve(narrowRows));
    let rejectWide;
    const wideLoader = vi.fn(() => new Promise((_, rej) => { rejectWide = rej; }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await act(async () => { root.render(React.createElement(Host, { narrowLoader, wideLoader })); });
      await act(async () => { await new Promise(r => setTimeout(r, 350)); });
      clickCloudTab();

      const allBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'All');
      await act(async () => { allBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await act(async () => { rejectWide(new Error('simulated')); await new Promise(r => setTimeout(r, 350)); });

      expect(container.textContent).toMatch(/Full-History Load Failed/);
    } finally { warnSpy.mockRestore(); }
  });
});
