// @vitest-environment happy-dom
// @ts-nocheck
// Fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-2026-11-11.md §1/§2
// Q10): "Every current-state KPI tile... shows actual vs. target with no click-through to which
// specific days drove this... metricSeries already returns the day-by-day series every tile's
// average is built from; the tile just doesn't expose it. A click-to-expand... is a real, scoped,
// non-speculative build." Renders the REAL AtAGlance component (CLAUDE.md's "would this
// verification still pass if reverted" rule), same fixture shape as
// dispatch-aag-viewas-scope-2026-11-11.test.js (ds.glimpseRows/ds.opsRows feed svcEffective).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const NOOP = () => {};
const recent = n => new Date(Date.now() - n * 864e5);
const GOOD = '3708';

const baseProps = {
  settings: { weekStartDay: 3 }, userEvents: [], lockedProjections: {},
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onOpenModal: NOOP, onNav: NOOP,
};

describe('At A Glance -- Service tile click-to-expand daily series', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  function clickOepeRow() {
    const labelDiv = [...container.querySelectorAll('div')].find(d => d.textContent.startsWith('OEPE W/O Parked') && d.children.length <= 1);
    expect(labelDiv, 'OEPE row label not found').toBeTruthy();
    act(() => { labelDiv.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }

  it('opens a modal with the daily series on click, and its own mean matches the tile\'s own average', () => {
    const ds = {
      glimpseRows: [
        { loc: GOOD, date: recent(3), oepe: 150 },
        { loc: GOOD, date: recent(2), oepe: 170 },
        { loc: GOOD, date: recent(1), oepe: 130 },
      ],
      opsRows: [],
      // noData gate (at-a-glance.js) checks laborRows/qsrActSummaryRows, not glimpseRows/opsRows
      // -- a minimal row here just keeps the Service section itself from being skipped.
      laborRows: [{ loc: GOOD, date: recent(1), tpph: 5, laborPct: 0.22 }],
    };
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }], dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    // Tile's own displayed average: (150+170+130)/3 = 150s.
    expect(container.textContent).toContain('150s');
    clickOepeRow();
    expect(container.textContent).not.toContain('No daily data for this period.');
    // All three distinct daily values show up in the expanded table.
    expect(container.textContent).toContain('150s');
    expect(container.textContent).toContain('170s');
    expect(container.textContent).toContain('130s');
  });

  it('close button dismisses the modal', () => {
    const ds = { glimpseRows: [{ loc: GOOD, date: recent(1), oepe: 150 }], opsRows: [],
      laborRows: [{ loc: GOOD, date: recent(1), tpph: 5, laborPct: 0.22 }] };
    act(() => {
      root.render(React.createElement(AtAGlance, {
        ...baseProps, ds, stores: [{ loc: GOOD }], dateRange: { s: recent(10), e: recent(1) },
      }));
    });
    clickOepeRow();
    expect(container.textContent).toContain('daily average');
    const closeBtn = [...container.querySelectorAll('button')].find(b => /close/i.test(b.getAttribute('aria-label') || '') || b.textContent === '✕' || b.textContent === '×');
    expect(closeBtn, 'close button not found').toBeTruthy();
    act(() => { closeBtn.click(); });
    expect(container.textContent).not.toContain('daily average');
  });
});
