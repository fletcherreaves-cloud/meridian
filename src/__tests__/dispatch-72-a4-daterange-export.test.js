// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #72 A4 -- DateRangeReport's exportCSV (src/views/analytics.js ~5966) built the
// filename from `selectedLocs`/`allLocs`, neither of which this component ever declared (its
// own selection state is `selLocs`, and "every store" is the sentinel string 'all', not a
// same-length array -- other sibling components in this same file use a real local `allLocs`,
// which is presumably where the name leaked from). The ReferenceError fired AFTER
// `URL.createObjectURL` and the <a> element were already built but BEFORE `a.click()` -- so
// the CSV blob existed in memory but the download silently never fired, on every export.
//
// Per the standing "would this verification still pass if reverted" rule, this renders the
// ACTUAL DateRangeReport consumer and drives it through Generate Report -> Export CSV, the
// exact two clicks a user performs -- not a call to some extracted filename-builder function
// (there isn't one; the bug lived inline in the component closure).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { DateRangeReport } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DateRangeReport CSV export (dispatch #72 A4)', () => {
  let container, root, origClick, clicks;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    clicks = [];
    origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    HTMLAnchorElement.prototype.click = origClick;
  });

  it('Export CSV does not throw and names the file with the AllStores scope', async () => {
    // No stores/storeIds needed -- the "all" selection with an empty ds.storeIds still
    // produces a (empty-results) report object, which is all exportCSV needs to run the
    // exact line that threw.
    const ds = { loaded: true, storeIds: [] };
    act(() => {
      root.render(React.createElement(DateRangeReport, {
        stores: [], ds, settings: {}, userEvents: [], onClose: () => {},
      }));
    });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Report'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); await Promise.resolve(); });

    const csvBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
    expect(csvBtn).toBeTruthy();
    expect(() => {
      act(() => { csvBtn.click(); });
    }).not.toThrow();

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toContain('AllStores');
    expect(clicks[0]).toMatch(/^DateRangeReport_.*_to_.*_AllStores\.csv$/);
  });
});
