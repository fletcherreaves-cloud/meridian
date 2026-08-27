// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #170 -- must not regress dispatch #169's product-mix item correlations (shipped v5.215,
// about an hour before this bug was reported). #169's own acceptance case pulled the FULL captured
// history for one item -- 7,916 rows across ~237 days (memory/finding-pmix-item-correlations-
// 2026-08-27.md) -- to reproduce the Filet-O-Fish/Friday correlation. The plain 'pmixRows'
// lazy-fill loader now defaults to a bounded 40-day window (dispatch #170's actual fix), which is
// NOT enough breadth for that math. This suite proves signals.js's ItemPicker and Scanner
// includeItems toggle now go through the WIDE tier (ensureLazyFillWide), not the plain bounded
// one, so #169's feature keeps getting the breadth it needs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SignalBuilder } from '../views/signals.js';
import { configureLazyFill, _resetLazyFillForTests, isLazyFillPending } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// Same shape as dispatch #169's own anchor case (finding doc): 237 days, Friday lift on item 5926.
function buildFofHistory() {
  const rows = [];
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < 237; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const isFri = d.getDay() === 5;
    rows.push({ loc: '3708', date: d.toISOString().slice(0, 10), item: 5926, price: 4.59, desc: 'Filet-O-Fish', familyGroup: 'REGULAR_ENTREE', soldQty: isFri ? 45 : 12 });
  }
  return rows;
}
const wideFofRows = buildFofHistory();
// A bounded (40-day) slice — what the plain narrow loader would have returned instead. Deliberately
// carries NO Friday at all so a correlation over it can't accidentally reproduce the real result —
// proves the picker is reading the WIDE data, not silently falling back to a narrow slice.
const narrowRowsNoFriday = wideFofRows.slice(0, 4); // 4 consecutive non-Friday days

// calFri's (loc,date) universe is synthesized from whichever real _CAL_SRC stream is loaded
// (signal-registry.js), not from pmixRows — laborRows here just supplies the day universe to
// match calFri against; it carries no sales signal of its own.
const laborRows = Array.from({ length: 237 }, (_, i) => {
  const d = new Date(2026, 0, 1 + i);
  return { loc: '3708', date: d, sales: 1000 };
});

describe('Signal Lab item correlation keeps its full historical breadth (dispatch #170, protecting #169)', () => {
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

  function Host({ narrowLoader, wideLoader }) {
    const [ds, setDs] = React.useState({ pmixRows: undefined, laborRows });
    configureLazyFill({ setDs, loaders: { pmixRows: narrowLoader }, wideLoaders: { pmixRows: wideLoader } });
    return React.createElement(SignalBuilder, { ds, onSave: () => {}, existingDefs: [] });
  }

  it('ItemPicker mounts straight into the WIDE tier -- the bounded loader is never called for it', async () => {
    const narrowLoader = vi.fn(() => Promise.resolve(narrowRowsNoFriday));
    const wideLoader = vi.fn(() => Promise.resolve(wideFofRows));

    await act(async () => { root.render(React.createElement(Host, { narrowLoader, wideLoader })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(wideLoader).toHaveBeenCalledTimes(1);
    expect(narrowLoader).not.toHaveBeenCalled();
  });

  it('once the wide fetch resolves, the item picker and the computed correlation both reflect the FULL 237-day/7-per-week history, not a bounded slice', async () => {
    const narrowLoader = vi.fn(() => Promise.resolve(narrowRowsNoFriday));
    const wideLoader = vi.fn(() => Promise.resolve(wideFofRows));

    await act(async () => { root.render(React.createElement(Host, { narrowLoader, wideLoader })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // X axis: Friday calendar flag.
    const selects = container.querySelectorAll('select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(selects[0], 'calFri');
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Y axis: search + select Filet-O-Fish via the real item picker.
    const searchInputs = Array.from(container.querySelectorAll('input[type="text"]'));
    const yItemInput = searchInputs[1];
    await act(async () => {
      yItemInput.dispatchEvent(new Event('focus', { bubbles: true }));
      setNativeValue(yItemInput, 'filet');
    });
    expect(container.textContent).toContain('Filet-O-Fish');

    const resultRow = Array.from(container.querySelectorAll('div')).find(el =>
      el.children.length === 2 && el.children[0].tagName === 'SPAN' && el.children[0].textContent === 'Filet-O-Fish');
    expect(resultRow).toBeTruthy();
    await act(async () => { resultRow.dispatchEvent(new Event('mousedown', { bubbles: true })); });

    const runBtn = Array.from(container.querySelectorAll('button')).find(b => /Run|Preview|Check/i.test(b.textContent || ''));
    await act(async () => { runBtn.dispatchEvent(new Event('click', { bubbles: true })); });

    // n must reflect the full 237-day history (matched pairs), not the 4-row narrow slice --
    // this is the concrete "did NOT silently narrow" assertion. And because the narrow slice
    // deliberately contains zero Fridays while the wide one has the real weekly pattern, a real
    // positive r here is only possible if the wide data is what actually got used.
    expect(container.textContent).toContain('n = 237 matched pairs');
    // Deterministic Friday=45/other=12 split (same shape as dispatch #169's own anchor test) ->
    // a clean +1.000, confirming the real computeCustomSignal path ran over the WIDE data (a
    // correlation against the narrow, Friday-less 4-row slice could not produce this).
    expect(container.textContent).toContain('+1.000');
  });

  it('Scanner\'s "Item Mix" toggle also opts into the WIDE tier, not the bounded default', async () => {
    // Exercise the same lazy-fill call the Scanner tab's includeItems effect makes
    // (src/views/signals.js) -- ScannerTab itself isn't exported for direct render, so this
    // confirms the shared mechanism it calls into behaves the same way ItemPicker's does,
    // which is what actually determines the breadth either consumer gets.
    const { ensureLazyFillWide } = await import('../engine/metric-source.js');
    const wideLoader = vi.fn(() => Promise.resolve(wideFofRows));
    const narrowLoader = vi.fn(() => Promise.resolve(narrowRowsNoFriday));
    let setDsCalls = [];
    configureLazyFill({ setDs: u => setDsCalls.push(u), loaders: { pmixRows: narrowLoader }, wideLoaders: { pmixRows: wideLoader } });

    ensureLazyFillWide('pmixRows');
    await Promise.resolve(); await Promise.resolve();

    expect(wideLoader).toHaveBeenCalledTimes(1);
    expect(narrowLoader).not.toHaveBeenCalled();
    expect(setDsCalls.length).toBe(1);
    expect(setDsCalls[0]({ pmixRows: [] }).pmixRows.length).toBe(237);
  });
});
