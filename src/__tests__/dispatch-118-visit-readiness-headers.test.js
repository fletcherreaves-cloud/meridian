// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #118 -- Visit Readiness: Days-Since-Last-Visit column + real column headers.
// Per the standing "would this verification still pass if reverted" rule, this renders the
// ACTUAL VisitReadinessPanel consumer (not just daysSince() or computeVisitReadiness() in
// isolation) -- an engine-only test could prove the arithmetic right while the panel never
// rendered it, which is exactly the bug this dispatch exists to fix.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { daysSince } from '../engine/visit-readiness.js';
import { DEFAULT_TARGETS, STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOCS = Object.keys(DEFAULT_TARGETS).slice(0, 2);
const [VISITED_LOC, NO_VISIT_LOC] = LOCS;
const VISITED_NAME = STORE_NAMES[VISITED_LOC] || ('Store ' + VISITED_LOC);
const NO_VISIT_NAME = STORE_NAMES[NO_VISIT_LOC] || ('Store ' + NO_VISIT_LOC);
const recent = n => new Date(Date.now() - n * 864e5);

// Same shape as visit-readiness-caption.test.js's goodRows() -- enough metric coverage per
// store to give every sub-score a real (non-null) value, so both fixture stores actually
// appear in res.stores (a store with wSum===0 is dropped entirely by computeVisitReadiness).
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.9, kvst: t.tKvst * 0.9, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.9, r2p: t.tR2p * 0.9 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.1, laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}

// VISITED_LOC has one graded visit exactly 40 days ago -- daysSince() must resolve to '40d'.
// NO_VISIT_LOC has none at all -- s.lastVisit is null and the panel must show '-'.
function mkDs() {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], gradedVisits: [] };
  for (const loc of LOCS) {
    const r = goodRows(loc);
    ds.glimpseRows.push(...r.glimpse); ds.opsRows.push(...r.ops); ds.laborRows.push(...r.labor); ds.schedRows.push(...r.sched);
  }
  ds.gradedVisits.push({ store: VISITED_LOC, dateISO: recent(40).toISOString(), reportType: 'CFV', score: 88, pass: true });
  return ds;
}

// A store's clickable row is a flex div whose second direct child's own store-name text
// (not descendants) equals the store's display name -- i.e. StoreRow's own name <div>, found
// this way (rather than by DOM position) so it survives the header row now sitting above the
// list.
function storeRowFor(container, storeName) {
  const nameEls = [...container.querySelectorAll('div')].filter(d =>
    d.children.length === 0 && d.textContent === storeName);
  expect(nameEls.length).toBeGreaterThanOrEqual(1);
  // Walk up to the row: name-div -> info-block -> row.
  return nameEls[0].parentElement.parentElement;
}

describe('Visit Readiness -- Days-Since-Last-Visit column + real headers (dispatch #118)', () => {
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

  it('renders exactly one real header row over the main store list, naming every sub-score column and Days since visit', () => {
    const ds = mkDs();
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    for (const label of ['Speed', 'Accuracy', 'Quality', 'Leadership']) {
      expect(container.textContent).toContain(label);
    }
    // Header-only phrase -- must appear exactly once (never repeated per data row).
    expect(container.textContent.match(/Days since visit/g)).toHaveLength(1);

    // The header row is its own element, distinct from and preceding both stores' rows.
    const headerEl = [...container.querySelectorAll('div')].find(d => d.textContent === 'Days since visit');
    expect(headerEl).toBeTruthy();
    const visitedRow = storeRowFor(container, VISITED_NAME);
    const pos = headerEl.compareDocumentPosition(visitedRow);
    // DOCUMENT_POSITION_FOLLOWING (4): visitedRow comes after headerEl in the DOM.
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the correct Days-Since-Last-Visit figure on the visited store\'s own row, and "—" on the store with no visit on record', () => {
    const ds = mkDs();
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    const expectedDays = daysSince(new Date(recent(40).toISOString()).getTime());
    const visitedRow = storeRowFor(container, VISITED_NAME);
    expect(visitedRow.textContent).toContain(expectedDays + 'd');

    const noVisitRow = storeRowFor(container, NO_VISIT_NAME);
    expect(noVisitRow.textContent).toContain('—');
    expect(noVisitRow.textContent).not.toMatch(/\d+d(?!ata)/); // no stray N-days figure
  });

  it('gives the Frequency-by-store block a real header row over its own columns, not a plain-text caption', () => {
    const ds = mkDs();
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    // Open the collapsed Visit Patterns section by clicking its header (identified by the
    // unique 📊 marker) -- a native click bubbles to the ancestor's React onClick handler.
    const emoji = [...container.querySelectorAll('span')].find(s => s.textContent === '📊');
    expect(emoji).toBeTruthy();
    act(() => { emoji.parentElement.click(); });

    expect(container.textContent).toContain('Frequency by store');
    // The old plain-text caption naming all four columns inline is gone.
    expect(container.textContent).not.toContain('Frequency by store (visits');
    for (const col of ['Visits', 'Avg gap', 'Since last', 'Pass']) {
      expect(container.textContent).toContain(col);
    }
  });
});
