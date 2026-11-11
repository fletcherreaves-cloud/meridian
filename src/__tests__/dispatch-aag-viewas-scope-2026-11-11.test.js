// @vitest-environment happy-dom
// @ts-nocheck
// Owner bug report 2026-11-11 (screenshot): viewing At A Glance while View As Role simulated a
// GM at one store (Madill-Hwy 70) still showed another store's data (Holdenville) -- the global
// SwingAlarm banner and the Visit Readiness tile both read cross-store data unfiltered. The View
// As Role scoping built 2026-11-08 (memory/plan-view-as-scope-2026-11-08.md) only ever covered
// CuratedHomePanel's own scopedBrief; this closes the same gap for every other consumer.
//
// Renders the real AtAGlance component (not VisitReadinessTile in isolation) per CLAUDE.md's
// "would this verification still pass if reverted" rule -- the bug was in the WIRING (the tile
// always reading result.stores[0], the global worst, with no narrowing from the caller's actual
// scope), not in computeVisitReadiness itself (already covered by visit-readiness.test.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';
import { DEFAULT_TARGETS } from '../constants.js';
import { viewAsAllowedLocs } from '../engine/curated-home.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const NOOP = () => {};
const recent = n => new Date(Date.now() - n * 864e5);

// Same two real loc ids + good/bad fixtures visit-readiness.test.js already establishes.
const GOOD = '3708';
const BAD = '5183';
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
  };
}
function badRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 1.6, kvst: t.tKvst * 1.7, laborPct: t.tCrewLabor * 1.4 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 2.5, r2p: t.tR2p * 1.6 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 0.6, laborPct: t.tCrewLabor * 1.4 })),
  };
}
function mkDs(...perStore) {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], gradedVisits: [] };
  for (const s of perStore) { ds.glimpseRows.push(...s.glimpse); ds.opsRows.push(...s.ops); ds.laborRows.push(...s.labor); }
  return ds;
}

const baseProps = {
  settings: { weekStartDay: 3 }, userEvents: [], lockedProjections: {},
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onOpenModal: NOOP, onNav: NOOP,
};

describe('viewAsAllowedLocs() -- shared scoping primitive', () => {
  it('returns null (no restriction) when no simulation is active', () => {
    expect(viewAsAllowedLocs('store', null)).toBeNull();
    expect(viewAsAllowedLocs(null, null)).toBeNull();
  });
  it('returns null at district altitude even with a scope set (no narrower concept exists there)', () => {
    expect(viewAsAllowedLocs('district', 'Some VP')).toBeNull();
  });
  it('narrows to exactly one store at store altitude', () => {
    const allowed = viewAsAllowedLocs('store', '3708');
    expect(allowed.has('3708')).toBe(true);
    expect(allowed.has('5183')).toBe(false);
  });
});

describe('At A Glance -- Visit Readiness tile respects the caller\'s actual store scope', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('BEFORE this fix this would show the globally-weakest store (BAD) even when scoped to GOOD -- confirm it shows GOOD instead', () => {
    // Both stores present in `ds` (as a real admin/owner's unrestricted ds would be while
    // simulating a lower role), but `stores` -- the prop AtAGlance actually receives, already
    // narrowed by App.js's viewAsAllowedLocs-based filtering -- carries only the simulated
    // store. GOOD is NOT the global worst (BAD is), so a tile still reading the global list
    // would show BAD's name; the fix makes it show GOOD's.
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }], dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    // Scope to the Visit Readiness card itself -- other tiles (Needs You Today) pull from
    // their own independent feed/cache and are not what this test is about.
    const header = [...container.querySelectorAll('div')].find(d => d.textContent === 'Visit Readiness');
    const card = header.closest('div[style*="surf2"]');
    expect(card).toBeTruthy();
    // Readiness band text ("ready"/"watch"/"at-risk") always renders; GOOD's own, not BAD's.
    expect(card.textContent).toMatch(/ready|watch|at-risk/i);
    // The literal regression this bug was: BAD's data leaking in when scoped to GOOD. GOOD
    // beats its targets everywhere in this fixture, so its band must not read at-risk.
    expect(card.textContent).not.toMatch(/at-risk/i);
  });

  it('with no scoping (district altitude, full stores list) still surfaces the real weakest store -- never changes behavior for an unscoped/real login', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }, { loc: BAD }], dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    const header = [...container.querySelectorAll('div')].find(d => d.textContent === 'Visit Readiness');
    const card = header.closest('div[style*="surf2"]');
    expect(card.textContent).toMatch(/at-risk/i);
  });
});

describe('At A Glance -- cross-store tiles hidden at store altitude (owner design guidance 2026-11-11)', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('hides the Store Leaderboard section when viewAsAltitude is "store"', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }], viewAsAltitude: 'store', dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    expect(container.textContent).not.toContain('Store Leaderboard');
  });

  it('shows the Store Leaderboard section when not simulating a store (viewAsAltitude unset)', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }, { loc: BAD }], dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    expect(container.textContent).toContain('Store Leaderboard');
  });
});
