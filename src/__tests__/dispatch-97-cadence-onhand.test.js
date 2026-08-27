// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #97 -- Inventory Control's Weekly Count Cadence widget (CadenceMonitor,
// eom-dashboard.js) used to grade completeness with weekly-cadence.js's analyzeCountCadence()
// over qsr_raw_item_detail -- a table dollar-filtered to each store's top ~20 variance items
// (widened to ~50 in dispatch #179, after this test was written; the coverage gap this test
// guards against is unaffected -- still dollar-filtered, still ZERO Condiment rows district-wide).
// A real, comprehensive count in qsr_onhand (the full
// active-item universe) could still read Overdue there because the narrow subset it actually
// checked fell a couple of items short of its own 60% threshold.
//
// The fix (cadenceFromOnHand, eom-dashboard.js) regrades completeness from qsr_onhand via
// count-cycle.js's detectSessions() -- the same Condiment-fixed (dispatch #96), full-item-
// universe session grouping Count Cycle uses -- at eom-inventory.js's own CLASS_DONE_PCT (0.98),
// per the owner's later scope addition to mirror EOM's real completion bar rather than
// count-cycle.js's own COVER_FRAC (0.75, which stays untouched for the Count Cycle panel itself).
// Below-threshold stores get a specific, $-ranked "still uncounted" item list (via EOM's own
// diagnoseIncompleteCount(), generalized with an explicit `windowStart`) instead of a bare label.
//
// Per this repo's "would this verification still pass if reverted" standing rule, this renders
// the ACTUAL CadenceMonitor consumer fed by the ACTUAL cadenceFromOnHand() builder (not an
// isolated engine-function unit test) -- reverting either half breaks these assertions:
//   - reverting cadenceFromOnHand back to a bare pass/fail (no missing-item list) drops the
//     "items left" text the low-count-fixture test asserts on.
//   - reverting the threshold from CLASS_DONE_PCT (0.98) back to COVER_FRAC (0.75) flips the
//     low-count fixture (95% Food coverage -- above 0.75, below 0.98) from "still short" to
//     "On track", which the test explicitly asserts against.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { CadenceMonitor, cadenceFromOnHand } from '../views/eom-dashboard.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ASOF = new Date('2026-08-24T00:00:00');

// 20 Food + 10 Condiment items -- small enough to hand-build, but the SAME shape
// loadQsrOnHand returns (src/lib/supabase.js): unpadded `loc`, camelCase fields, real class
// strings ('Food'/'Condiment') exactly as count-cycle.js's CLASSES expects.
function foodCondRows(loc, { foodCounted, condCounted, date }) {
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    rows.push({
      // active:true -- count-cycle.js's isActive() excludes active:false Food/Paper/Non-Product
      // rows from the universe entirely (the Topic-3/Topic-6 recipe-binding check, dispatch16);
      // Condiment bypasses that flag unconditionally (dispatch #96), so it's irrelevant below.
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

// Below-threshold store: 19/20 Food (95%, clears the OLD COVER_FRAC=0.75 but not the NEW
// CLASS_DONE_PCT=0.98) + 10/10 Condiment (100%) on 2026-08-18 -- mirrors the real production
// shape measured for Seminole (10915) during this dispatch's live verification (116/122 Food,
// 37/37 Condiment on 08-18).
const BELOW_LOC = '10915';
const belowRows = foodCondRows(BELOW_LOC, { foodCounted: 19, condCounted: 10, date: '2026-08-18' });

// Fully-compliant store: 20/20 Food + 10/10 Condiment on 2026-08-22 -- mirrors the real
// production shape measured for store 10422 in this dispatch's live verification.
const OK_LOC = '10422';
const okRows = foodCondRows(OK_LOC, { foodCounted: 20, condCounted: 10, date: '2026-08-22' });

const onHandRows = [...belowRows, ...okRows];

// rawByLoc fixture for the itemVarianceWindows drill-down (qsr_raw_item_detail shape) -- this
// stays UNCHANGED by dispatch #97 (a genuinely different question: "when did this item's
// variance happen," not "did they complete the weekly count"). One item with two count points
// far enough apart in $ that windowsFor's >=50 filter keeps it.
const rawByLoc = {
  [BELOW_LOC]: [
    {
      wrin: 'F1', descr: 'Food Item 1', cls: 'Food',
      history: [
        { dt: '08/01/2026', tm: '09:00', isCount: true, difference: 0 },
        { dt: '08/18/2026', tm: '09:00', isCount: true, difference: -120 },
      ],
    },
  ],
};

function findRow(container, name) {
  return [...container.querySelectorAll('tr')].find(r => r.textContent.includes(name));
}

describe('CadenceMonitor + cadenceFromOnHand (dispatch #97 -- qsr_onhand basis, CLASS_DONE_PCT)', () => {
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

  it('grades a real, comprehensive-but-not-98%-perfect count as still short, with a specific missing-item list -- not a bare Overdue label', () => {
    const cadenceByLoc = cadenceFromOnHand(onHandRows, { asOf: ASOF });
    // The engine-level shape a revert to a 0.75-style bare pass/fail would break: still-below-98%
    // Food, fully-covered Condiment, and a real missing-item list naming the exact item.
    expect(cadenceByLoc[BELOW_LOC].lastWeekly).toBeNull();
    expect(cadenceByLoc[BELOW_LOC].daysSinceWeekly).toBeNull();
    expect(cadenceByLoc[BELOW_LOC].lastAttempt).toBe('2026-08-18');
    const foodMissing = cadenceByLoc[BELOW_LOC].missing.find(b => b.cls === 'food');
    expect(foodMissing.count).toBe(1);
    expect(foodMissing.items[0].descr).toBe('Food Item 20');   // the one never-counted Food item

    const rows = [
      { loc: BELOW_LOC, name: 'Seminole-Milt Phillips' },
      { loc: OK_LOC, name: 'Some Other Store' },
    ];
    act(() => {
      root.render(React.createElement(CadenceMonitor, {
        rows, cadenceByLoc, rawByLoc, fobRows: [], period: '2026-08', nm: () => '',
      }));
    });

    const row = findRow(container, 'Seminole-Milt Phillips');
    expect(row).toBeTruthy();
    // NOT the old engine's fabricated "Overdue" read off a narrow top-$ subset -- the real
    // qsr_onhand count is comprehensive (29/30 items, 96.7%), so it must not read Overdue either;
    // it reads "no full weekly YET" with a small, specific, actionable remainder.
    expect(row.textContent).toContain('No full weekly');
    expect(row.textContent).toContain('1 item left');
  });

  it('reads a genuinely 98%+ complete session as On track, with the correct date and no missing-item badge', () => {
    const cadenceByLoc = cadenceFromOnHand(onHandRows, { asOf: ASOF });
    expect(cadenceByLoc[OK_LOC].lastWeekly).toBe('2026-08-22');
    expect(cadenceByLoc[OK_LOC].daysSinceWeekly).toBe(2);
    expect(cadenceByLoc[OK_LOC].missing).toBeNull();

    const rows = [{ loc: OK_LOC, name: 'Fully Compliant Store' }];
    act(() => {
      root.render(React.createElement(CadenceMonitor, {
        rows, cadenceByLoc, rawByLoc: {}, fobRows: [], period: '2026-08', nm: () => '',
      }));
    });
    const row = findRow(container, 'Fully Compliant Store');
    expect(row.textContent).toContain('On track');
    expect(row.textContent).not.toContain('items left');
  });

  it('the click-to-expand variance-window drill-down (itemVarianceWindows/qsr_raw_item_detail) still works unchanged', () => {
    const cadenceByLoc = cadenceFromOnHand(onHandRows, { asOf: ASOF });
    const rows = [{ loc: BELOW_LOC, name: 'Seminole-Milt Phillips' }];
    act(() => {
      root.render(React.createElement(CadenceMonitor, {
        rows, cadenceByLoc, rawByLoc, fobRows: [], period: '2026-08', nm: () => '',
      }));
    });
    const row = findRow(container, 'Seminole-Milt Phillips');
    act(() => { row.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    // The expanded drill-down names the item and its $ delta between the two count points.
    expect(container.textContent).toContain('Biggest between-count variance windows');
    expect(container.textContent).toContain('Food Item 1');
    expect(container.textContent).toContain('120');
  });
});
