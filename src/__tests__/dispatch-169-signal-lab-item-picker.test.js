// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #169 — renders the ACTUAL Signal Lab builder (not just the engine underneath it),
// proving the item picker's real end-to-end path: search -> select -> build a custom signal ->
// see a real r-value. Per this repo's "verification must touch the call site" rule (a test that
// only imports signal-registry.js can't tell "the resolver works" from "the resolver works but
// nothing in the UI can ever reach it"). SignalBuilder is exported specifically for this, same
// pattern as ParkOepeTab (dispatch #155's own render test / export comment).
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SignalBuilder } from '../views/signals.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// React's controlled-input tracking intercepts the plain DOM `.value =` setter, so a raw
// assignment + dispatchEvent('input') is silently swallowed (React sees no "real" change).
// The standard workaround: go through the native prototype setter directly, bypassing React's
// tracked wrapper, then dispatch 'input' so React's onChange still fires.
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// SignalBuilder's ItemPicker imports ensureLazyFillWide (metric-source.js, dispatch #170 --
// was ensureLazyFill before this dispatch narrowed the plain lazy-fill tier's default window) --
// harmless no-op here since no lazy-fill hook is configured in this test process; ds.pmixRows
// below is provided directly.

describe('Signal Lab item picker — real end-to-end (dispatch #169)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  // Small, hand-built but realistic ds: a Friday-linked item (Filet-O-Fish, matching the real
  // FR anchor) plus an unrelated item, so the search has more than one hit to filter through.
  const days = Array.from({ length: 30 }, (_, i) => new Date(2026, 0, 1 + i));
  const laborRows = days.map(d => ({ loc: '3708', date: d, sales: 1000 }));
  const pmixRows = [];
  for (const d of days) {
    const ds8 = d.toISOString().slice(0, 10);
    const isFri = d.getDay() === 5;
    pmixRows.push({ loc: '3708', date: ds8, item: 5926, price: 4.59, desc: 'Filet-O-Fish', familyGroup: 'REGULAR_ENTREE', soldQty: isFri ? 45 : 12 });
    pmixRows.push({ loc: '3708', date: ds8, item: 4314, price: 1.19, desc: 'McChicken', familyGroup: 'REGULAR_ENTREE', soldQty: 30 });
  }
  const ds = { laborRows, pmixRows };

  function renderBuilder() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(SignalBuilder, { ds, onSave: () => {}, existingDefs: [] })); });
  }

  it('searching narrows to the real item, selecting it sets the axis, and Run shows a real r', () => {
    renderBuilder();

    // X axis: pick the Friday calendar flag via the existing dropdown.
    const selects = container.querySelectorAll('select');
    const xSelect = selects[0];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(xSelect, 'calFri');
      xSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(xSelect.value).toBe('calFri');

    // Y axis: search the product-mix item picker for "filet" (partial, case-insensitive).
    const searchInputs = Array.from(container.querySelectorAll('input[type="text"]'));
    // Two ItemPickers render (X and Y) -- the second one is the Y-axis item search.
    expect(searchInputs.length).toBe(2);
    const yItemInput = searchInputs[1];

    act(() => {
      yItemInput.dispatchEvent(new Event('focus', { bubbles: true }));
      setNativeValue(yItemInput, 'filet');
    });

    // The dropdown result list should show ONLY the Filet-O-Fish match, not McChicken.
    expect(container.textContent).toContain('Filet-O-Fish');
    expect(container.textContent).not.toContain('McChicken');

    // Click the matching result row (a <div> whose first <span> child is the item's desc).
    const resultRow = Array.from(container.querySelectorAll('div')).find(el =>
      el.children.length === 2 && el.children[0].tagName === 'SPAN' && el.children[0].textContent === 'Filet-O-Fish');
    expect(resultRow).toBeTruthy();
    act(() => {
      resultRow.dispatchEvent(new Event('mousedown', { bubbles: true }));
    });

    // The picker now shows the selected chip with the real label, not the raw key.
    expect(container.textContent).toContain('Filet-O-Fish · Sold Qty');

    // Run the preview (computeCustomSignal under the hood) and confirm a real r-value renders.
    const runBtn = Array.from(container.querySelectorAll('button')).find(b => /Run|Preview|Check/i.test(b.textContent || ''));
    expect(runBtn).toBeTruthy();
    act(() => { runBtn.dispatchEvent(new Event('click', { bubbles: true })); });

    // A real, signed r-value renders in the preview — this dataset's Friday lift is
    // deterministic (soldQty is exactly 45 on Fridays, 12 every other day), so the actual
    // computed correlation is a clean +1.000, and the "Strong link"/"n = 30 matched pairs"
    // copy confirms it's the real computeCustomSignal path, not a stub.
    expect(container.textContent).toContain('Preview result');
    expect(container.textContent).toContain('+1.000');
    expect(container.textContent).toContain('n = 30 matched pairs');
    expect(container.textContent).toContain('Strong link');
  });
});
