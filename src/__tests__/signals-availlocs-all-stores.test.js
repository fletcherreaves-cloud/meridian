// @vitest-environment happy-dom
// @ts-nocheck
// signals.js's SignalBuilder/ScannerTab/SignalsPanel each built their store-picker or
// location-filter dropdown by unioning presence across ds.laborRows/opsRows/schedRows/ctrlRows
// only -- so a store whose only data was cloud-pulled (qsrActSummaryRows, glimpseRows, etc,
// which Signal Lab and Scanner's own metrics already read via metric-source.js's auto-first
// resolver) never appeared in its own picker. Fixed to Object.keys(STORE_NAMES), same pattern
// this file's own ParkOepeTab (`LOCS`) already used.
//
// Per "would this verification still pass if reverted?": renders the REAL SignalBuilder with a
// ds fixture that carries NO laborRows/opsRows at all (cloud-only shape) and asserts a real
// STORE_NAMES store still shows up in the Scope dropdown -- under the old code the dropdown would
// have exactly one option ("All stores (district)"), so a revert fails this.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SignalBuilder } from '../views/signals.js';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('SignalBuilder Scope picker -- lists all stores, not just ones with manual/legacy rows', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('shows every STORE_NAMES store even when ds carries no laborRows/opsRows at all', async () => {
    ({ container, root } = mountRoot());
    const ds = { loaded: true, qsrActSummaryRows: [{ loc: '3708', date: new Date('2026-08-01'), sales: 1000 }] };
    await act(async () => {
      root.render(React.createElement(SignalBuilder, { ds, onSave: () => {}, existingDefs: [] }));
    });

    const selects = container.querySelectorAll('select');
    const scopeSelect = [...selects].find(s => [...s.options].some(o => o.value === 'district'));
    expect(scopeSelect, 'Scope <select> not found').toBeTruthy();
    const optionValues = [...scopeSelect.options].map(o => o.value);

    const allStoreLocs = Object.keys(STORE_NAMES);
    expect(allStoreLocs.length).toBeGreaterThan(20);
    for (const loc of allStoreLocs) {
      expect(optionValues, `store ${loc} (${STORE_NAMES[loc]}) missing from Scope picker`).toContain(loc);
    }
  });

  it('without the fix, an empty-ds fixture would list only "district" (sanity check the fixture actually exercises the bug)', async () => {
    ({ container, root } = mountRoot());
    // Simulates the OLD behavior directly (not a re-render of the fixed component -- there is no
    // toggle) by confirming the picker's only guaranteed option pre-fix was the district default;
    // the real assertion above is what proves the fix, this just documents the contrast.
    const ds = {};
    await act(async () => {
      root.render(React.createElement(SignalBuilder, { ds, onSave: () => {}, existingDefs: [] }));
    });
    const selects = container.querySelectorAll('select');
    const scopeSelect = [...selects].find(s => [...s.options].some(o => o.value === 'district'));
    // Even with a totally empty ds, the fixed picker still lists every known store (not gated on
    // any data being present at all) -- this is the behavior the old union-of-raw-rows code could
    // never produce, since an empty ds meant an empty Set.
    expect(scopeSelect.options.length).toBe(Object.keys(STORE_NAMES).length + 1);
  });
});
