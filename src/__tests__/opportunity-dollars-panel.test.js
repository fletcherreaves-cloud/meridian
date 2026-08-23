// @vitest-environment happy-dom
// @ts-nocheck
// Opportunity $ v1 (memory/design-opportunity-dollars.md) -- renders the ACTUAL
// OpportunityDollars consumer, not the pure engine functions underneath, per this repo's
// "would this verification still pass if reverted" bar: a bug in the panel's own window/scope
// wiring (e.g. always calling computeOpportunity in 'bic' mode, hardcoding the window to MTD
// regardless of the toggle, or not re-deriving `locs` on a scope change) fails this test even
// though opportunity.js / opportunity-district.js would still be individually correct.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { OpportunityDollars } from '../views/opportunity-dollars.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dk = d => d.toISOString().slice(0, 10);

// Every day from the 1st of the CURRENT month through today -- matches mtdRange()'s own
// window, which the panel computes internally (not injectable), so the fixture has to track
// the real calendar rather than a fixed date.
function mtdDates() {
  const today = new Date();
  const out = [];
  for (let d = new Date(today.getFullYear(), today.getMonth(), 1); d <= today; d.setDate(d.getDate() + 1)) {
    out.push(dk(new Date(d)));
  }
  return out;
}

const LOC = '3708'; // real DEFAULT_TARGETS store: tCrewLabor 0.21, tFOBTarget 0.0385 (constants.js)

function mkFixture() {
  const dates = mtdDates();
  const ds = { laborRows: [], qsrFobRows: [] };
  for (const date of dates) {
    // 0.30 actual vs 0.21 target -- well over, so labor$ > 0 regardless of how many MTD days exist.
    ds.laborRows.push({ loc: LOC, date: new Date(date + 'T00:00:00'), sales: 10000, gc: 1000, laborPct: 0.30 });
  }
  const prodSales = dates.length * 10000;
  ds.qsrFobRows.push({ loc: LOC, date: dates[dates.length - 1], prodSalesAmt: prodSales, compWasteAmt: prodSales * 0.09 }); // ~9% vs 3.85% target
  return ds;
}

const STORES = [{ loc: LOC }];

describe('Opportunity $ drill-down (v1)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows a positive headline $ and a matching by-store row for a store over target', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(OpportunityDollars, { stores: STORES, ds, onClose: () => {} })); });

    const headline = container.querySelector('[data-testid="opportunity-headline"]');
    expect(headline).toBeTruthy();
    expect(headline.textContent).toMatch(/\$[1-9]/); // a real positive dollar figure, not $0

    const rows = [...container.querySelectorAll('[data-testid="opportunity-row"]')];
    expect(rows.map(r => r.getAttribute('data-loc'))).toEqual([LOC]);
  });

  it('states the methodology on its surface -- vs own target, floored at $0', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(OpportunityDollars, { stores: STORES, ds, onClose: () => {} })); });
    const txt = container.textContent;
    expect(txt).toContain('OWN target');
    expect(txt).toContain('Floored at $0');
  });

  // The panel's window toggle must actually change the range passed to districtOpportunity --
  // this fixture ONLY has data inside the current MTD window, so switching to trailing-6mo
  // (which excludes the current partial month entirely) must zero the $ figures out, not
  // silently keep showing the MTD numbers (the exact bug a hardcoded 'mtd' window would
  // produce). The store still renders as a $0 row -- buildOnePagerInputs always returns one
  // entry per scoped loc regardless of data -- so the assertion is on the DOLLAR FIGURE
  // changing, not the row disappearing.
  it('switching to Trailing 6 Months re-queries a different window (figures go to $0, no MTD leak)', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(OpportunityDollars, { stores: STORES, ds, onClose: () => {} })); });
    const headlineBefore = container.querySelector('[data-testid="opportunity-headline"]').textContent;
    expect(headlineBefore).toMatch(/\$[1-9]/);

    const sixMoBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Trailing 6 Months');
    expect(sixMoBtn).toBeTruthy();
    act(() => { sixMoBtn.click(); });

    const headlineAfter = container.querySelector('[data-testid="opportunity-headline"]').textContent;
    expect(headlineAfter).toContain('$0');
    expect(headlineAfter).not.toMatch(/\$[1-9]/);
  });
});
