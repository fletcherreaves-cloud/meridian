// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #73 — Visit Patterns coloured a store's daysSinceLast amber past a hardcoded 60 days.
// MEASURED against 190 real CFV inter-visit intervals (27 stores, 2023-01..2026-08, Propel
// getCfvHistory, recorded in memory/finding-cfv-predictability-ceiling-2026-08-22.md): the median
// gap is 138d and 166/190 = 87.4% of NORMAL intervals exceed 60d. An alarm that fires on 87% of
// normal behaviour carries no information — a store perfectly on cadence sat amber permanently.
//
// Two halves to the fix, and this file covers both:
//   1. the threshold is now OVERDUE_CADENCE_MULTIPLE x the instrument's own cadence. 2x was
//      measured, not chosen: observed p90 = 255d = 2.10x the 122d CFV cadence, and 2x fires on
//      12.1% of intervals.
//   2. freq rows now carry the LAST visit's reportType, because the panel's default filter is
//      'all' and a row could otherwise mix CFV (122d) with RGR (365d) under one threshold.
//
// Revert-sensitive by construction: the 200-day CFV case below is amber under the old 60d rule
// and NOT amber under the new one, so restoring the constant fails this file. Per the standing
// rule it renders the ACTUAL VisitReadinessPanel consumer — asserting on the engine's `overdue`
// field alone could not tell "the engine computes it" from "the panel actually colours by it".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { VISIT_CADENCE_DAYS, OVERDUE_CADENCE_MULTIPLE } from '../engine/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

const AMBER = '#f59e0b';
const iso = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const recent = n => new Date(Date.now() - n * 864e5);

// Three stores, each a deliberate case. The panel only renders the Visit Patterns block once it
// has real readiness rows to score, so every store gets the same operating-metric fixture shape
// the existing visit-readiness tests use -- the cadence cases live in gradedVisits.
const CASES = [
  // 200d since last CFV: past the OLD 60d rule (would be amber) but inside 2 x 122d (must NOT be).
  { loc: '3708', type: 'CFV', ages: [560, 380, 200] },
  // 300d since last CFV: past 2 x 122d = 244d (must BE amber).
  { loc: '5183', type: 'CFV', ages: [700, 520, 300] },
  // NEW STORE: two visits, most recent 30d ago. Must never be flagged -- a short history is
  // complete for its age, not thin (Ponce de Leon / Tishomingo in the real data).
  { loc: '5985', type: 'CFV', ages: [90, 30] },
];

function opRows(loc, idx) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  const m = 0.7 + idx * 0.2;
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * m, kvst: t.tKvst * m, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * m, r2p: t.tR2p * m })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * (2 - m), laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}

function mkDs() {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], gradedVisits: [] };
  CASES.forEach((c, i) => {
    const r = opRows(c.loc, i);
    ds.glimpseRows.push(...r.glimpse); ds.opsRows.push(...r.ops);
    ds.laborRows.push(...r.labor); ds.schedRows.push(...r.sched);
    c.ages.forEach((age, j) => ds.gradedVisits.push({
      store: c.loc, dateISO: iso(age), reportType: c.type, score: 70 + i * 5 + j, pass: true,
    }));
  });
  return ds;
}

// Day counts are asserted as NUMBERS, not strings: the fixture builds dates via an ISO
// round-trip, so "300 days ago" renders as 301d. Matching the literal string would make this
// test fail on a boundary that has nothing to do with the threshold under test.
function dayCells(container) {
  return [...container.querySelectorAll('span')]
    .filter(el => /^\d+d$/.test(el.textContent.trim()))
    .map(el => ({ days: parseInt(el.textContent, 10), amber: (el.getAttribute('style') || '').includes(AMBER) }));
}
const near = (cells, n) => cells.find(c => Math.abs(c.days - n) <= 2);
function expandVisitPatterns(container) {
  // Click the 📊 icon span: React delegates at the root, so a bubbling click on any descendant
  // reaches the header div's onClick. Targeting the handler div directly is brittle -- several
  // nested divs share the same textContent prefix.
  const icon = [...container.querySelectorAll('span')].find(el => el.textContent === '📊');
  expect(icon, 'Visit Patterns header should render').toBeTruthy();
  act(() => icon.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  expect(container.textContent, 'Visit Patterns should expand').toContain('Frequency by store');
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Visit Patterns cadence threshold (dispatch #73)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('the threshold is derived from the instrument cadence, not a hardcoded 60', () => {
    expect(VISIT_CADENCE_DAYS.CFV).toBe(Math.round(365 / 3));
    expect(VISIT_CADENCE_DAYS.RGR).toBe(365);
    expect(OVERDUE_CADENCE_MULTIPLE).toBe(2);
    // The whole point: the CFV threshold must be far above the retired 60.
    expect(VISIT_CADENCE_DAYS.CFV * OVERDUE_CADENCE_MULTIPLE).toBeGreaterThan(200);
  });

  it('colours only genuinely-unusual gaps amber — 200d CFV is NOT amber, 300d IS', () => {
    act(() => root.render(React.createElement(VisitReadinessPanel, { ds: mkDs(), onClose: () => {} })));
    expandVisitPatterns(container);
    const cells = dayCells(container);
    const at300 = near(cells, 300), at200 = near(cells, 200), at30 = near(cells, 30);
    expect(at300, 'the 300d store should render a day cell').toBeTruthy();
    expect(at200, 'the 200d store should render a day cell').toBeTruthy();
    expect(at30,  'the new store should render a day cell').toBeTruthy();
    // Past 2 x 122d = 244d -> genuinely unusual, amber.
    expect(at300.amber).toBe(true);
    // Past the OLD 60d rule but inside the new one. THIS is the revert-sensitive assertion:
    // restoring `> 60` colours this amber and fails here.
    expect(at200.amber).toBe(false);
    // A new store's short history is complete for its age, never a flag.
    expect(at30.amber).toBe(false);
  });

  it('says what the amber means, and does not frame a long gap as the store failing', () => {
    act(() => root.render(React.createElement(VisitReadinessPanel, { ds: mkDs(), onClose: () => {} })));
    expandVisitPatterns(container);
    const text = container.textContent;
    expect(text).toContain('expected gap for that visit type');
    // Scheduling is McDonald's-side; the copy must say so rather than implying store fault.
    expect(text).toMatch(/scheduled by McDonald/i);
  });
});
