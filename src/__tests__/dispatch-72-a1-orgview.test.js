// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #72 A1 -- OrgView (the Patch/Org nav view, rendered from App.js for BOTH
// view==='patch' and view==='org') read `priceChanges` without ever declaring it: that
// identifier belongs to DistrictGrid, a sibling function, not to OrgView's own scope. An
// unconditional ReferenceError on every render of either nav view, all three of OrgView's
// tabs (operator/supervisor/all). Fixed by giving OrgView its own `ds`-derived priceChanges
// useMemo (same pattern DistrictGrid already used) and threading `ds` through from App.js's
// two h(OrgView, {...}) call sites.
//
// Per the standing "would this verification still pass if reverted" rule, this renders the
// ACTUAL OrgView consumer with a real ds.pmixRows fixture -- an engine-level check of
// lastPriceChangeByStore alone can't tell "the engine computes correctly" from "OrgView
// actually calls it instead of throwing before it ever gets there."
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { OrgView } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Confirmed price-step fixture: flat >=14 observed days at the old price, then flat >=14
// observed days at the new price -- matches price-events.js's own confirmation rule.
function pmixDays(loc, item, price, start, n) {
  const out = [];
  const d0 = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push({ loc, item, price, date: d.toISOString().slice(0, 10) });
  }
  return out;
}

const LOC = '13113';
function mkStore(loc, name) {
  return {
    loc, name,
    p: { laborPct: 0.28, oepe: 175, tpph: 92, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore: 78, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

describe('OrgView renders (dispatch #72 A1 -- priceChanges out-of-scope ReferenceError)', () => {
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

  it('does not throw on the operator-grouped view, and surfaces a confirmed price change from ds.pmixRows', () => {
    const stores = [mkStore(LOC, 'Test Store')];
    const settings = { operators: { 'Test Op': [LOC] }, supervisorGroups: {} };
    const ds = {
      pmixRows: [
        ...pmixDays(LOC, 1, 2.79, '2026-01-01', 14),
        ...pmixDays(LOC, 1, 2.99, '2026-01-15', 14),
      ],
    };
    expect(() => {
      act(() => {
        root.render(React.createElement(OrgView, { stores, ds, settings, onSelectStore: () => {} }));
      });
    }).not.toThrow();
    const text = container.textContent;
    expect(text).toContain('Test Store');
    expect(text).toContain('Last price change');
  });

  it('does not throw on the All Stores view either (the other branch reading priceChanges)', () => {
    const stores = [mkStore(LOC, 'Test Store')];
    const settings = { operators: {}, supervisorGroups: {} };
    const ds = { pmixRows: [] };
    act(() => {
      root.render(React.createElement(OrgView, { stores, ds, settings, onSelectStore: () => {} }));
    });
    // Switch to the "All Stores" tab -- the second of OrgView's two priceChanges reads.
    const allBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All Stores');
    expect(allBtn).toBeTruthy();
    expect(() => {
      act(() => { allBtn.click(); });
    }).not.toThrow();
    expect(container.textContent).toContain('Test Store');
  });
});
