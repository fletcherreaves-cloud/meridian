// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #98 -- Inventory Control's four top summary tiles (Stores Reporting / Believe Done
// >=90% / Avg Count Complete / Count Window) and the By-Class row used to render UNCONDITIONALLY
// off EOM-basis `summary`/`classSummary`/`inWindow`, regardless of which tab (mode) was selected
// -- so viewing Count Cycle showed frozen, often-zero EOM numbers instead of anything about
// weekly-count completion, even though the Weekly Count Cadence table right below (CadenceMonitor,
// dispatch #97, cadenceByLoc/qsr_onhand-basis) had real data on the same screen at the same time.
//
// The fix: `SummaryTiles` (extracted from EOMDashboardPanel's render body, eom-dashboard.js) picks
// its tile/by-class SOURCE by `mode` -- EOM/Scoreboard keep the original summary/classSummary/
// inWindow markup byte-for-byte; Count Cycle (mode==='progress') swaps to `cycleSummaryFor(rows,
// cadenceByLoc)`, its own weekly-cadence-basis aggregate (dispatch #97's cadenceByLoc, NOT r.prog).
//
// Per this repo's "would this verification still pass if reverted" standing rule (CLAUDE.md), this
// renders the ACTUAL `SummaryTiles` consumer -- the exact component EOMDashboardPanel calls, with
// the mode branch that WAS missing living inside it -- not an isolated calc-function unit test.
// Reverting the mode branch (rendering `tiles`/`classRow` unconditionally from summary/classSummary
// again) breaks the "progress mode must NOT show EOM's tiles" assertions below.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { SummaryTiles, cycleSummaryFor, cadenceFromOnHand } from '../views/eom-dashboard.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── cycleSummaryFor: engine-level checks against real cadenceFromOnHand() output ──────────────
// Same fixture shape as dispatch-97-cadence-onhand.test.js (loadQsrOnHand's own row shape).
function foodCondRows(loc, { foodCounted, condCounted, date }) {
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    rows.push({
      loc, wrin: `F${i}`, descr: `Food Item ${i}`, cls: 'Food',
      onHandAmt: 10 * i, active: true,
      lastCounted: i <= foodCounted ? new Date(date + 'T00:00:00') : null,
    });
  }
  for (let i = 1; i <= 10; i++) {
    rows.push({
      loc, wrin: `C${i}`, descr: `Condiment Item ${i}`, cls: 'Condiment',
      onHandAmt: 5 * i, active: false,
      lastCounted: i <= condCounted ? new Date(date + 'T00:00:00') : null,
    });
  }
  return rows;
}

const ASOF = new Date('2026-08-24T00:00:00');
// On track: 20/20 Food + 10/10 Condiment, 2 days before asOf.
const ON_TRACK_LOC = '10422';
// Short attempt this period, no qualifying session -> "Never" bucket (daysSinceWeekly null).
const SHORT_LOC = '10915';
const onHandRows = [
  ...foodCondRows(ON_TRACK_LOC, { foodCounted: 20, condCounted: 10, date: '2026-08-22' }),
  ...foodCondRows(SHORT_LOC, { foodCounted: 19, condCounted: 10, date: '2026-08-18' }),
];
const rowsFixture = [
  { loc: ON_TRACK_LOC, name: 'On Track Store' },
  { loc: SHORT_LOC, name: 'Short Store' },
];

describe('cycleSummaryFor (dispatch #98 engine)', () => {
  it('buckets stores correctly and computes item-weighted Food+Condiment coverage from real cadenceFromOnHand output', () => {
    const cadenceByLoc = cadenceFromOnHand(onHandRows, { asOf: ASOF });
    const s = cycleSummaryFor(rowsFixture, cadenceByLoc);

    expect(s.n).toBe(2);
    expect(s.nOnTrack).toBe(1);            // ON_TRACK_LOC only
    expect(s.nNever).toBe(1);              // SHORT_LOC never cleared CLASS_DONE_PCT this period
    expect(s.nOverdue).toBe(0);            // "Overdue" requires a daysSinceWeekly value >= 8, not "never"

    // Item-weighted: ON_TRACK contributes 30/30, SHORT contributes 29/30 (19 Food + 10 Condiment
    // counted of 20+10) -- NOT a mean of two store percentages (which would be (100%+96.67%)/2).
    const expectedAvg = (30 + 29) / (30 + 30);
    expect(s.avg).toBeCloseTo(expectedAvg, 4);

    const food = s.classSummary.find(c => c.k === 'food');
    const cond = s.classSummary.find(c => c.k === 'condiment');
    expect(food.pct).toBeCloseTo(39 / 40, 4);   // 20+19 of 20+20
    expect(cond.pct).toBeCloseTo(1, 4);          // 10+10 of 10+10
    expect(food.doneStores).toBe(1);             // only ON_TRACK clears 98% on Food (19/20 = 95% does not)
    expect(cond.doneStores).toBe(2);              // both clear 98% on Condiment (100% each)
  });

  it('returns a null avg (not a misleading 0%) when no store has any cadence data at all', () => {
    const s = cycleSummaryFor([{ loc: '99999', name: 'No Data Store' }], {});
    expect(s.n).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.classSummary.every(c => c.pct === null)).toBe(true);
  });
});

// ── SummaryTiles: the actual render consumer, all three modes ─────────────────────────────────
const EOM_SUMMARY = { n: 27, done: 3, avg: 0.42 };
const EOM_CLASS_SUMMARY = [
  { k: 'food', label: 'Food', fob: true, pct: 0.55, doneStores: 2, n: 27 },
  { k: 'condiment', label: 'Condiment', fob: true, pct: 0.31, doneStores: 1, n: 27 },
  { k: 'paper', label: 'Paper', fob: false, pct: 0, doneStores: 0, n: 27 },
  { k: 'nonproduct', label: 'Non-Product', fob: false, pct: 0, doneStores: 0, n: 27 },
];
const CYCLE_SUMMARY = {
  n: 27, nOnTrack: 3, nOverdue: 21, nNever: 3, avg: 0.9412,
  classSummary: [
    { k: 'food', label: 'Food · weekly', fob: true, pct: 0.93, doneStores: 3, n: 27 },
    { k: 'condiment', label: 'Condiment · weekly', fob: true, pct: 0.99, doneStores: 24, n: 27 },
  ],
};

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(SummaryTiles, props)); });
  return { container, root };
}

describe('SummaryTiles (dispatch #98 -- the fixed call site)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
  });

  it('mode="eom": renders the ORIGINAL EOM tiles/labels/values -- unchanged by this fix', () => {
    ({ container, root } = render({
      mode: 'eom', summary: EOM_SUMMARY, cycleSummary: CYCLE_SUMMARY,
      classSummary: EOM_CLASS_SUMMARY, inWindow: true, hasRows: true,
    }));
    const text = container.textContent;
    expect(text).toContain('Stores reporting');
    expect(text).toContain('27');
    expect(text).toContain('Believe done (≥90%)');
    expect(text).toContain('3/27');
    expect(text).toContain('Avg count complete');
    expect(text).toContain('42.00%');
    expect(text).toContain('Count window');
    expect(text).toContain('OPEN');
    expect(text).toContain('Non-Product');
    // Must NOT leak any Count Cycle-only wording into EOM mode.
    expect(text).not.toContain('On track (weekly)');
    expect(text).not.toContain('Overdue (');
    expect(text).not.toContain('weekly');
  });

  it('mode="scoreboard": same EOM basis as "eom" (both keep current behavior exactly)', () => {
    ({ container, root } = render({
      mode: 'scoreboard', summary: EOM_SUMMARY, cycleSummary: CYCLE_SUMMARY,
      classSummary: EOM_CLASS_SUMMARY, inWindow: false, hasRows: true,
    }));
    const text = container.textContent;
    expect(text).toContain('Believe done (≥90%)');
    expect(text).toContain('Count window');
    expect(text).toContain('not yet');   // inWindow: false
  });

  it('mode="progress" (Count Cycle): renders cycleSummary numbers with their OWN labels -- not EOM\'s frozen tiles', () => {
    ({ container, root } = render({
      mode: 'progress', summary: EOM_SUMMARY, cycleSummary: CYCLE_SUMMARY,
      classSummary: EOM_CLASS_SUMMARY, inWindow: true, hasRows: true,
    }));
    const text = container.textContent;

    // The regression this dispatch fixes: EOM's own tile wording must be GONE in Count Cycle mode.
    expect(text).not.toContain('Believe done (≥90%)');
    expect(text).not.toContain('Count window');
    expect(text).not.toContain('Avg count complete');

    // Count Cycle's own, differently-labeled tiles, with cycleSummary's real numbers.
    expect(text).toContain('On track (weekly)');
    expect(text).toContain('3/27');
    expect(text).toContain('Avg weekly F+C complete');
    expect(text).toContain('94.12%');
    expect(text).toContain('Overdue (≥8d)');
    expect(text).toContain('21 (+3 never)');

    // By-class row: Food/Condiment ONLY (weekly cadence never checks Paper/Non-Product), with
    // cycleSummary's own numbers -- not EOM's 55%/31%/0%/0%.
    expect(text).toContain('Food · weekly');
    expect(text).toContain('93.00%');
    expect(text).toContain('Condiment · weekly');
    expect(text).toContain('99.00%');
    expect(text).not.toContain('Paper');
    expect(text).not.toContain('Non-Product');
    expect(text).not.toContain('55.00%');   // EOM's Food pct must not leak through
  });

  it('mode="progress" with no cadence data anywhere: avg tile reads "—", not a misleading 0.00%', () => {
    const empty = cycleSummaryForFixtureEmpty();
    ({ container, root } = render({
      mode: 'progress', summary: EOM_SUMMARY, cycleSummary: empty,
      classSummary: EOM_CLASS_SUMMARY, inWindow: true, hasRows: true,
    }));
    const tiles = [...container.querySelectorAll('div')].map(d => d.textContent);
    expect(container.textContent).toContain('Avg weekly F+C complete');
    // The tile's own big-number line reads em-dash, not "0.00%" or "NaN%".
    expect(container.textContent).not.toContain('NaN');
  });
});

function cycleSummaryForFixtureEmpty() {
  return { n: 0, nOnTrack: 0, nOverdue: 0, nNever: 0, avg: null, classSummary: [
    { k: 'food', label: 'Food · weekly', fob: true, pct: null, doneStores: 0, n: 0 },
    { k: 'condiment', label: 'Condiment · weekly', fob: true, pct: null, doneStores: 0, n: 0 },
  ] };
}
