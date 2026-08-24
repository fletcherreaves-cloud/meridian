// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #94 Phase 1 -- store-dash.js's UnifiedTargetsPanel KPI table declared `tol:` (an
// absolute, per-metric tolerance) on 24 metrics but colored each row via statusCol/statusIcon,
// which instead compared a RELATIVE-to-target gap against a uniform 5%/15% band regardless of
// what the metric measures. That's the wrong comparison unit for a metric like Comp Waste %,
// whose real district-average target is on the order of 0.2% -- 15% relative is a razor-thin
// ~0.0003 absolute band, so ordinary day-to-day noise reads as deep red. `tol` (declared at
// 0.001 for Comp Waste, i.e. 0.1 percentage points) is the right absolute scale.
//
// Per this repo's "would this verification still pass if reverted" rule, this renders the
// ACTUAL UnifiedTargetsPanel consumer (not just the statusCol closure in isolation) so a revert
// of the fix -- or of the table's wiring to it -- shows up as a failure here. The official
// target (district-wide average, since the panel opens in "All Stores" scope by default) is
// computed from the real DEFAULT_TARGETS in constants.js, not hardcoded, so the assertion holds
// even as target data changes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { UnifiedTargetsPanel } from '../views/store-dash.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function findRow(container, label) {
  const rows = [...container.querySelectorAll('tr')];
  return rows.find(r => r.textContent.includes(label));
}

describe('UnifiedTargetsPanel status coloring (dispatch #94 Phase 1 -- tol replaces 5%/15% relative band)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('colors Comp Waste % green under the new absolute-tol scheme in a case the old 5%-relative band would have called red', () => {
    // District-wide official target for Comp Waste %, computed the same way officialT does
    // for the 'all' scope (mean of DEFAULT_TARGETS[loc].tCompWaste across real stores) -- not
    // hardcoded, so this stays correct if the target file's numbers change.
    const locs = Object.keys(DEFAULT_TARGETS).filter(l => DEFAULT_TARGETS[l].tCompWaste > 0);
    expect(locs.length).toBeGreaterThan(0);
    const officialAvg = locs.reduce((s, l) => s + DEFAULT_TARGETS[l].tCompWaste, 0) / locs.length;

    const TOL = 0.001; // matches compW's declared tol in store-dash.js METRICS
    const delta = 0.0008; // inside tol (new=green) but >15% relative to a target this small (old=red)
    const cur = officialAvg + delta;

    // Sanity: this delta really would disagree under the two schemes, given the real target.
    const oldRelativeGap = (cur - officialAvg) / officialAvg; // lowerBetter metric
    expect(oldRelativeGap).toBeGreaterThan(0.15); // old scheme: RED
    expect(Math.abs(cur - officialAvg)).toBeLessThanOrEqual(TOL); // new scheme: GREEN

    // Feed the district-wide dollar-weighted FOB current-value path (fobDollarPairs / _fobMonthly,
    // used for the default 'All Stores' scope) with one real store's cloud MTD data, sized so
    // compWasteAmt/prodSalesAmt reduces exactly to `cur`.
    const prodSales = 300000;
    const d = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const ds = {
      qsrFobRows: [
        { loc: locs[0], date: d, prodSalesAmt: prodSales, compWasteAmt: cur * prodSales },
      ],
    };

    act(() => {
      root.render(React.createElement(UnifiedTargetsPanel, {
        stores: [], ds, settings: {}, onClose: () => {}, embedded: true,
      }));
    });

    const row = findRow(container, 'Comp Waste %');
    expect(row).toBeTruthy();
    // New (tol-based) scheme: within tol -> green "On Target". The old relative-5% scheme would
    // have flagged this same cur/off pair "Off Track" (red) per oldRelativeGap above.
    expect(row.textContent).toContain('On Target');
    expect(row.textContent).not.toContain('Off Track');
    expect(row.textContent).not.toContain('Watch');
  });
});
