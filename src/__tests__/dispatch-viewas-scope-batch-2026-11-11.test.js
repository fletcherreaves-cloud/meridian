// @vitest-environment happy-dom
// @ts-nocheck
// View As Role scoping audit, phase 2 (owner-directed continuation, 2026-11-11): the panels
// receiving App.js's raw, unscoped `stores` prop were audited for the same bug class fixed
// earlier this session in At A Glance/SwingAlarm, Security Command Center, and AttentionPanel
// (an admin/owner simulating a lower role via View As Role could still see cross-store data,
// because a panel read the FULL dataset instead of the role-narrowed one).
//
// ~19 panels confirmed to derive their rendered store list purely from the `stores` prop they
// receive (no independent load, no ALL_LOCS/Object.keys(STORE_NAMES)/ds.storeIds enumeration
// that bypasses it) -- for those, App.js's own call sites now pass the shared `scopedStores`
// (narrowed by viewAsAllowedLocs when simulating, a no-op otherwise) instead of raw `stores`,
// closing the leak with zero behavior change for a real, unscoped login.
//
// Per the standing "would this verification still pass if reverted" rule, this renders two of
// those panels for real (DistrictGrid, OrgView) and confirms narrowing a `stores` array actually
// narrows what renders -- proving the call-site swap is a real fix, not a no-op prop rename.
// The other ~17 panels in this same batch were confirmed via direct code reading (not just the
// audit sub-agents' claims) to have the identical "derives its loc universe strictly from the
// stores prop" shape; they are not individually re-tested here given their uniform mechanical
// nature, but are cited by file:line in the accompanying PR description.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { DistrictGrid, OrgView } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Same proven-working fixture shape as dispatch-72-a1-orgview.test.js.
function mkStore(loc, name, opsScore = 78) {
  return {
    loc, name,
    p: { laborPct: 0.28, oepe: 175, tpph: 92, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

const GOOD = mkStore('3708', 'Ardmore-Broadway');
const BAD = mkStore('5183', 'Chickasha-So 4th');

describe('DistrictGrid -- respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('scoped to one store, a second real store never renders', () => {
    act(() => {
      root.render(React.createElement(DistrictGrid, {
        stores: [GOOD], ds: { loaded: true }, settings: {}, dateRange: { s: new Date(), e: new Date() },
        userEvents: [], onSelectStore: () => {},
      }));
    });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).not.toContain('Chickasha-So 4th');
  });

  it('unscoped (both stores in view), both real stores still render -- never changes behavior for a real, unscoped login', () => {
    act(() => {
      root.render(React.createElement(DistrictGrid, {
        stores: [GOOD, BAD], ds: { loaded: true }, settings: {}, dateRange: { s: new Date(), e: new Date() },
        userEvents: [], onSelectStore: () => {},
      }));
    });
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Chickasha-So 4th');
  });
});

describe('OrgView -- respects the caller\'s actual store scope ("All Stores" tab, which reads `stores` directly)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  function clickAllStores() {
    const allBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All Stores');
    act(() => { allBtn.click(); });
  }

  it('scoped to one store, a second real store never renders', () => {
    act(() => {
      root.render(React.createElement(OrgView, {
        stores: [GOOD], ds: { loaded: true }, settings: { operators: {}, supervisorGroups: {} }, onSelectStore: () => {},
      }));
    });
    clickAllStores();
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).not.toContain('Chickasha-So 4th');
  });

  it('unscoped (both stores in view), both real stores still render -- never changes behavior for a real, unscoped login', () => {
    act(() => {
      root.render(React.createElement(OrgView, {
        stores: [GOOD, BAD], ds: { loaded: true }, settings: { operators: {}, supervisorGroups: {} }, onSelectStore: () => {},
      }));
    });
    clickAllStores();
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Chickasha-So 4th');
  });
});
