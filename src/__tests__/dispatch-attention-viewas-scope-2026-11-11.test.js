// @vitest-environment happy-dom
// @ts-nocheck
// Owner bug report 2026-11-11 (the same View As Role leak class as At A Glance/Security, found
// while auditing other panels that receive App.js's raw `stores`/`ds`): useAttentionFeed's
// visitStores (feeding visitRisk()) and csatOpportunities (feeding csatOpportunityAlerts()) both
// computed over the FULL ds, unfiltered by the hook's own allLocs -- unlike every other detector
// in this file, which already loops `allLocs.map(loc => ...)`. App.js's AttentionPanel call site
// now receives the shared `scopedStores` (narrowed by viewAsAllowedLocs when simulating a lower
// role) instead of the raw `stores` -- these two detectors must actually respect that narrowed
// `stores` prop for the fix to hold, which is what this test renders through the real hook to
// confirm (per the standing "would this verification still pass if reverted" rule).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useAttentionFeed } from '../views/attention-now.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Host({ ds, stores, dateRange }) {
  const feed = useAttentionFeed({ ds, stores, dateRange, max: 50 });
  return React.createElement('pre', null, JSON.stringify(feed));
}

// Same two real loc ids + good/bad fixtures visit-readiness.test.js already establishes.
const GOOD = '3708';
const BAD = '5183';
const recent = n => new Date(Date.now() - n * 864e5);
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
  const ds = { loaded: true, glimpseRows: [], opsRows: [], laborRows: [], gradedVisits: [] };
  for (const s of perStore) { ds.glimpseRows.push(...s.glimpse); ds.opsRows.push(...s.ops); ds.laborRows.push(...s.labor); }
  return ds;
}

describe('useAttentionFeed -- visitRisk respects the caller\'s actual store scope', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('BEFORE this fix, BAD store\'s at-risk item would show even when scoped to GOOD only -- confirm it is excluded', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: GOOD }], dateRange })); });
    // GOOD beats its targets everywhere in this fixture -- its own visit-readiness band must not
    // read at-risk, and BAD's item (the literal leak) must never appear at all.
    expect(container.textContent).not.toContain('"visit-' + BAD + '"');
    expect(container.textContent).not.toMatch(/visit-readiness at risk/i);
  });

  it('with no scoping (both stores in view), the real at-risk store still surfaces -- never changes behavior for a real, unscoped login', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: GOOD }, { loc: BAD }], dateRange })); });
    expect(container.textContent).toContain('"visit-' + BAD + '"');
  });
});

describe('useAttentionFeed -- csatOpportunityAlerts respects the caller\'s actual store scope', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('a second store\'s real CSAT opportunity never leaks in when scoped to just one store', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const smgRowsA = Array.from({ length: 5 }, () => ({ loc: GOOD, satisfactionLabel: 'Satisfied', text: 'great service, fast!' }));
    const smgRowsB = Array.from({ length: 5 }, () => ({ loc: BAD, satisfactionLabel: 'Dissatisfied', text: 'waited forever, the line was so slow' }));
    const ds = { loaded: true, smgRows: [...smgRowsA, ...smgRowsB] };
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: GOOD }], dateRange })); });
    expect(container.textContent).not.toContain('"csat-' + BAD + '"');
  });

  it('with no scoping, the real CSAT opportunity still surfaces -- never changes behavior for a real, unscoped login', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const smgRowsB = Array.from({ length: 5 }, () => ({ loc: BAD, satisfactionLabel: 'Dissatisfied', text: 'waited forever, the line was so slow' }));
    const ds = { loaded: true, smgRows: smgRowsB };
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: BAD }], dateRange })); });
    expect(container.textContent).toContain('"csat-' + BAD + '"');
  });
});

// Third leak in this same audit pass (identified but not yet fixed when the two above shipped):
// dueForReview() (engine/coaching-loop.js) has no loc filter of its own, and each cycle row
// carries a `.loc` (toAttentionItem's id is `coaching-review-${cycle.loc}-...`), so ds.coachingCycles
// was the same "raw ds.* array, no built-in scoping" shape as smgRows above.
describe('useAttentionFeed -- coaching-review-due items respect the caller\'s actual store scope', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });
  const todayKey = new Date().toISOString().slice(0, 10);
  function dueCycle(loc) {
    return { id: 'cyc-' + loc, loc, metric: 'labor_pct', result: null, reviewAt: todayKey, coachedAt: todayKey, note: 'test note' };
  }

  it('a second store\'s due coaching review never leaks in when scoped to just one store', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, coachingCycles: [dueCycle(GOOD), dueCycle(BAD)] };
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: GOOD }], dateRange })); });
    expect(container.textContent).not.toContain('coaching-review-' + BAD);
    expect(container.textContent).toContain('coaching-review-' + GOOD);
  });

  it('with no scoping, both stores\' due coaching reviews still surface -- never changes behavior for a real, unscoped login', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, coachingCycles: [dueCycle(GOOD), dueCycle(BAD)] };
    const dateRange = { s: recent(10), e: recent(1) };
    act(() => { root.render(React.createElement(Host, { ds, stores: [{ loc: GOOD }, { loc: BAD }], dateRange })); });
    expect(container.textContent).toContain('coaching-review-' + GOOD);
    expect(container.textContent).toContain('coaching-review-' + BAD);
  });
});
