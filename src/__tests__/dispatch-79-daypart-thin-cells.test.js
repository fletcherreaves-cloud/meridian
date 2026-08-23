// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #79 item 2 -- Day of week/Daypart/Weekpart were the last 3 groupings in Visit Patterns
// still on the pooled `block()` renderer without dispatch #75's thin-cell guard (Channel got its
// own CHANNEL_YEAR_MIN_N-gated treatment there; these three did not). Owner's own example: a
// Dinner daypart cell at n=2 rendered a confident-looking "0.00%".
//
// Per the dispatch brief's explicit instruction, this does NOT reuse CHANNEL_YEAR_MIN_N (measured
// for the channel x year distribution only) -- it's a chosen, RELATIVE floor instead: within a
// block, a row under half of that block's own best-covered row is thin.
//
// Renders the ACTUAL VisitPatterns consumer (not analyzeGradedVisits directly) -- reverting the
// view's thin-cell check must fail this test even though the engine's byVar() grouping would
// still be intact, per the standing "would this still pass if reverted, touching the call site"
// bar.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitPatterns } from '../views/visit-readiness.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mkVisits(daypart, n, passCount, store = '10422') {
  return Array.from({ length: n }, (_, i) => ({
    store, daypart, channel: 'driveThru', reportType: 'CFV',
    dateISO: `2026-03-${String((i % 27) + 1).padStart(2, '0')}`,
    score: i < passCount ? 90 : 65,
    pass: i < passCount,
  }));
}

// All three in the SAME "Daypart" block, so the relative floor (0.5 * that block's own max n)
// is computed against Lunch's n=20: floor=10. Breakfast sits EXACTLY at the boundary (pins
// "< floor", not "<= floor" -- 10 is NOT thin). Dinner at n=2 is well under it -- the owner's own
// "Dinner 0.00% on n=2" case, both visits failing (a real 0%, not a synthetic non-zero dodge).
function mkFixture() {
  return [
    ...mkVisits('Lunch', 20, 18),
    ...mkVisits('Breakfast', 10, 9),
    ...mkVisits('Dinner', 2, 0),
  ];
}

function openPanel(container) {
  const header = container.querySelectorAll('div')[1];
  act(() => { header.click(); });
}

// A block() row is a leaf-ish div whose FIRST child span's text is exactly the daypart key --
// not a broad textContent.startsWith(), which also matches ancestor containers that concatenate
// EVERY row's text together.
function findRow(container, key) {
  return [...container.querySelectorAll('div')].find(d =>
    d.children.length > 1 && d.children[0].tagName === 'SPAN' && d.children[0].textContent === key);
}

describe('Daypart/Weekpart/DOW thin-cell floor (dispatch #79 item 2)', () => {
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

  it('a thin Daypart cell (Dinner, n=2, well under half the block max) is marked thin, never a bare confident percentage', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);

    const dinnerRow = findRow(container, 'Dinner');
    expect(dinnerRow).toBeTruthy();
    expect(dinnerRow.textContent).toContain('n2');
    expect(dinnerRow.textContent).toContain('(thin)');
    expect(dinnerRow.textContent).not.toContain('%');
  });

  it('a Daypart cell exactly at the relative floor (Breakfast, n=10 = half of Lunch\'s n=20) still shows a real rate', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);

    const breakfastRow = findRow(container, 'Breakfast');
    expect(breakfastRow).toBeTruthy();
    expect(breakfastRow.textContent).toContain('n10');
    expect(breakfastRow.textContent).not.toContain('(thin)');
    expect(breakfastRow.textContent).toContain('90.00%'); // 9/10
  });

  it('the best-covered cell in the block (Lunch, n=20) is never marked thin', () => {
    const ds = { gradedVisits: mkFixture() };
    act(() => { root.render(React.createElement(VisitPatterns, { ds, locs: null })); });
    openPanel(container);

    const lunchRow = findRow(container, 'Lunch');
    expect(lunchRow).toBeTruthy();
    expect(lunchRow.textContent).not.toContain('(thin)');
    expect(lunchRow.textContent).toContain('90.00%'); // 18/20
  });
});
