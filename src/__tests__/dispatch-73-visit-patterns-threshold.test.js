// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #73 -- Visit Patterns' "overdue" amber was a flat `daysSinceLast > 60`, never
// measured: on 190 real CFV inter-visit intervals (all 27 stores, 2023-01 -> 2026-08) it fired
// on 166/190 (87.4%) -- a store perfectly on cadence sat amber PERMANENTLY. Fixed with a
// per-instrument threshold (src/engine/visit-readiness.js's EXPECTED_CADENCE_DAYS x 2,
// CFV=242d/EcoSure=364d/RGR=730d) computed from each store's OWN last-visit reportType, so the
// panel's type filter defaulting to 'all' no longer mixes different program cadences under one
// number.
//
// Per the standing "would this verification still pass if reverted" rule, this renders the
// ACTUAL VisitPatterns consumer with a fixture whose gaps straddle the new CFV threshold,
// asserting the rendered colour -- not a unit test of the EXPECTED_CADENCE_DAYS constant alone,
// which couldn't tell "the panel reads the right field" from "the panel still hardcodes 60."
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitPatterns } from '../views/visit-readiness.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

// CFV overdue threshold is 121 * 2 = 242 days (raised from 1.5x/182d after measuring the fire
// rate: 1.5x still flagged 33.7% of NORMAL intervals, 2x flags 12.6% and sits on the observed
// p90 of 255d). Every gap/daysSinceLast value below is distinct across all three stores so a
// row can be found by its own displayed text.
const OVERDUE_LOC = '10422';   // Atoka -- last CFV visit 300 days ago -- past 242, amber
// 220d is the KEY case: past the retired 1.5x line (182d) but inside 2x. It pins the multiplier
// itself -- reverting to 1.5 colours this row amber and fails.
const UNDER2X_LOC = '11657';   // Purcell -- last CFV visit 220 days ago -- under 242, not amber
const ONCADENCE_LOC = '10915'; // Seminole -- last CFV visit 90 days ago -- under 242, not amber
const NEW_LOC = '43701';       // Ponce de Leon -- 2 CFV visits, both recent -- not amber

function mkDs() {
  return {
    gradedVisits: [
      // OVERDUE_LOC: avgGapDays=350, daysSinceLast=300 (distinct values, no column collision).
      { store: OVERDUE_LOC, dateISO: daysAgo(650), score: 88, pass: true, reportType: 'CFV' },
      { store: OVERDUE_LOC, dateISO: daysAgo(300), score: 85, pass: true, reportType: 'CFV' },
      // UNDER2X_LOC: daysSinceLast=220 -- between the old 1.5x line and the new 2x line.
      { store: UNDER2X_LOC, dateISO: daysAgo(600), score: 81, pass: true, reportType: 'CFV' },
      { store: UNDER2X_LOC, dateISO: daysAgo(220), score: 83, pass: true, reportType: 'CFV' },
      // ONCADENCE_LOC: avgGapDays=210, daysSinceLast=90.
      { store: ONCADENCE_LOC, dateISO: daysAgo(300), score: 90, pass: true, reportType: 'CFV' },
      { store: ONCADENCE_LOC, dateISO: daysAgo(90), score: 92, pass: true, reportType: 'CFV' },
      // NEW_LOC: dispatch #73's explicit new-store fixture case -- avgGapDays=45, daysSinceLast=15.
      { store: NEW_LOC, dateISO: daysAgo(60), score: 80, pass: true, reportType: 'CFV' },
      { store: NEW_LOC, dateISO: daysAgo(15), score: 82, pass: true, reportType: 'CFV' },
    ],
  };
}

// Each store's row is its own flex div with 5 span children, in column order:
// [name, n, avgGapDays, daysSinceLast (the coloured one), passRate]. Found by the row
// containing the store's own display name, rather than by any single cell's text (which can
// collide with another cell's value across columns/rows).
function daysSinceLastSpan(container, storeName) {
  const rowDivs = [...container.querySelectorAll('div')].filter(d =>
    [...d.children].filter(c => c.tagName === 'SPAN').length === 5 &&
    d.children[0].textContent === storeName);
  expect(rowDivs).toHaveLength(1);
  return rowDivs[0].children[3];
}

describe('VisitPatterns amber threshold (dispatch #73)', () => {
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

  it('colours a store past the CFV cadence threshold amber, one under it not, and a new store not', () => {
    const ds = mkDs();
    act(() => {
      root.render(React.createElement(VisitPatterns, { ds, locs: [OVERDUE_LOC, UNDER2X_LOC, ONCADENCE_LOC, NEW_LOC] }));
    });
    // The section starts collapsed -- open it to reach the Frequency-by-store rows. The
    // clickable header is the outer wrapper's first child div (index 0 is the wrapper itself).
    const header = container.querySelectorAll('div')[1];
    act(() => { header.click(); });

    const overdueSpan = daysSinceLastSpan(container, 'Atoka-Mississippi');
    const under2xSpan = daysSinceLastSpan(container, 'Purcell');
    const onCadenceSpan = daysSinceLastSpan(container, 'Seminole-Milt Phillips');
    const newStoreSpan = daysSinceLastSpan(container, 'Ponce de Leon-Hwy 81/I-10');

    expect(overdueSpan.textContent).toBe('300d');
    expect(under2xSpan.textContent).toBe('220d');
    expect(onCadenceSpan.textContent).toBe('90d');
    expect(newStoreSpan.textContent).toBe('15d');

    expect(overdueSpan.style.color).toBe('#f59e0b'); // amber: 300d > 242d
    // 220d is past the retired 1.5x line (182d) and inside 2x. This assertion PINS THE
    // MULTIPLIER: reverting OVERDUE_MULTIPLIER to 1.5 colours this row amber and fails here.
    expect(under2xSpan.style.color).not.toBe('#f59e0b');
    expect(onCadenceSpan.style.color).not.toBe('#f59e0b');
    expect(newStoreSpan.style.color).not.toBe('#f59e0b');

    // The old flat threshold is gone -- no unlabeled magic 60 in the panel's own caption.
    expect(container.textContent).not.toMatch(/\b60\s*d(ays)?\b/i);
    // The colour's meaning is now labeled (dispatch #73 item 3).
    expect(container.textContent.toLowerCase()).toContain('amber');
  });
});
