// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #112 — Weekly Count Cadence: count-day population fix, "Last Count" column, per-class
// Food/Condiment/Paper uncounted-item columns, and a full-class (incl. Paper) missed-item drilldown.
//
// Item 1 (count-day population) was measured LIVE against real qsr_onhand before any code changed
// (service-role read, period 2026-08, 27 stores, single-period-scoped to match the real app's
// loadQsrOnHand({period}) call): the OLD weeklyDone-only basis populated detectedWeekdayName for
// 2/27 stores (7.4%); the fix (broadening to any touchedWeekly session) populates 27/27 (100%).
// The fixture below reproduces the SAME shape that live measurement found (every real session
// tops out well under the 98% Food+Condiment bar, but a clear weekday pattern is still there).
//
// Items 2-4 reuse count-cycle.js's cycleCompliance() (paperMissing/perClassCounted/lastAny) per
// the dispatch's own explicit "reuse, don't reimplement" finding — these tests exercise that
// integration through cadenceFromOnHand()/CadenceMonitor (the actual consumers), not the engine
// functions in isolation, per this repo's "would this verification still pass if reverted" rule.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { CadenceMonitor, cadenceFromOnHand } from '../views/eom-dashboard.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function findRow(container, name) {
  return [...container.querySelectorAll('tr')].find(r => r.textContent.includes(name));
}

describe('cadenceFromOnHand — item 1: count-day population uses touchedWeekly, not weeklyDone-only', () => {
  it('detects a real weekday pattern from partial (never-98%) weekly attempts, where the old weeklyDone-only basis would read blank', () => {
    const loc = 'DOW1';
    const rows = [];
    // 15 Food items total, split into 3 groups whose CURRENT last_counted date differs — the
    // rolling-latest-state shape qsr_onhand actually has (count-cycle.js's own documented
    // limitation). Each of the 3 dates is a Thursday; each individual session only ever shows
    // 5/15 Food (33%) and 3/9 Condiment (33%) — nowhere near the 98% bar, exactly like the real
    // 2026-08 measurement (every live session topped out around 45-52%, never 98%).
    const dates = ['2026-08-06', '2026-08-13', '2026-08-20'];   // all Thursdays
    for (let g = 0; g < 3; g++) {
      for (let i = 1; i <= 5; i++) {
        rows.push({ loc, wrin: `F${g}-${i}`, descr: `Food ${g}-${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date(dates[g] + 'T00:00:00') });
      }
      for (let i = 1; i <= 3; i++) {
        rows.push({ loc, wrin: `C${g}-${i}`, descr: `Condiment ${g}-${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date(dates[g] + 'T00:00:00') });
      }
    }
    const cadenceByLoc = cadenceFromOnHand(rows, { asOf: new Date('2026-08-21T00:00:00') });
    const c = cadenceByLoc[loc];
    // No session ever reaches the 98% Food+Condiment bar -- confirms the fixture reproduces the
    // "old basis reads blank" shape.
    expect(c.lastWeekly).toBeNull();
    expect(c.daysSinceWeekly).toBeNull();
    // But the fix still detects the real weekly pattern from the touchedWeekly (partial) sessions.
    expect(c.detectedWeekdayName).toBe('Thu');   // WEEKDAY_NAMES (weekly-cadence.js) is short-form
  });

  it('leaves an empty pattern truly empty (no touchedWeekly sessions at all) -- not a false positive', () => {
    const loc = 'DOW2';
    // Paper-only activity -- never touches Food or Condiment, so touchedWeekly is false for
    // every session and there is genuinely no weekly pattern to detect.
    const rows = [
      { loc, wrin: 'P1', descr: 'Napkins', cls: 'Paper', active: true, onHandAmt: 5, lastCounted: new Date('2026-08-06T00:00:00') },
    ];
    const c = cadenceFromOnHand(rows, { asOf: new Date('2026-08-21T00:00:00') })[loc];
    expect(c.detectedWeekdayName).toBeNull();
  });
});

describe('cadenceFromOnHand — item 2: "Last Count" is the literal most-recent activity, distinct from Last full count / lastAttempt', () => {
  it('shows a later date than the last qualifying weekly count when a smaller stray touch (a different class) happened since', () => {
    const loc = 'LC1';
    const rows = [];
    // A genuinely full, compliant weekly count on 2026-08-18 (20 Food + 10 Condiment, 100% each).
    for (let i = 1; i <= 20; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date('2026-08-18T00:00:00') });
    for (let i = 1; i <= 10; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date('2026-08-18T00:00:00') });
    // A small Paper touch three days later -- doesn't affect the Food+Condiment weekly grading at
    // all, but IS real count activity, and is more recent than the compliant weekly count.
    rows.push({ loc, wrin: 'P1', descr: 'Napkins', cls: 'Paper', active: true, onHandAmt: 3, lastCounted: new Date('2026-08-21T00:00:00') });

    const c = cadenceFromOnHand(rows, { asOf: new Date('2026-08-25T00:00:00') })[loc];
    expect(c.lastWeekly).toBe('2026-08-18');
    expect(c.lastAttempt).toBe('2026-08-18');   // the big session is still the size-picked "attempt"
    expect(c.lastCount).toBe('2026-08-21');     // but the literal most-recent activity is later
    expect(c.lastCount).not.toBe(c.lastWeekly);
  });
});

describe('cadenceFromOnHand — item 3/4: per-class Food/Condiment/Paper uncounted counts + full-class drilldown', () => {
  const PAPER_DUE = 'PDUE1';
  const asOfMid = new Date('2026-08-18T00:00:00');   // day 18 -- inside the mid-month Paper window

  function paperDueRows(loc) {
    const rows = [];
    // Food/Condiment fully compliant on an earlier date -- keeps this store's Food/Condiment
    // weekly grading real (not a vacuous zero-universe artifact) while isolating the Paper case.
    for (let i = 1; i <= 5; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date('2026-08-04T00:00:00') });
    for (let i = 1; i <= 3; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date('2026-08-04T00:00:00') });
    // 10 active Paper items; only 6 counted (60%, below COVER_FRAC=0.75) on 08-15 -- a real,
    // in-progress mid-month Paper attempt that doesn't clear the bar. 4 never counted this period.
    for (let i = 1; i <= 6; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-08-15T00:00:00') });
    for (let i = 7; i <= 10; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: null });
    return rows;
  }

  it('gates the Paper uncounted count on paperMissing -- populated when Paper is due and short, with the exact count', () => {
    const c = cadenceFromOnHand(paperDueRows(PAPER_DUE), { asOf: asOfMid })[PAPER_DUE];
    expect(c.paperMissing).toBe(true);
    expect(c.uncountedPaper).toBe(4);
    expect(c.uncountedFood).toBe(0);        // fully compliant Food -- 0 uncounted, not N/A
    expect(c.uncountedCondiment).toBe(0);
    const paperRow = c.missing.find(b => b.cls === 'paper');
    expect(paperRow).toBeTruthy();
    expect(paperRow.count).toBe(4);
    expect(paperRow.items.map(u => u.descr).sort()).toEqual(['Paper 10', 'Paper 7', 'Paper 8', 'Paper 9'].sort());
  });

  it('does not count a PRIOR-period Paper touch toward the current period -- a store untouched this period reads fully outstanding, not partially counted', () => {
    // Regression guard for a real bug found via live measurement (store 43701, 2026-08-25): a
    // Paper session dated in a PRIOR period must not satisfy the CURRENT period's requirement.
    const loc = 'PAPERCROSSPERIOD';
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date('2026-08-04T00:00:00') });
    for (let i = 1; i <= 3; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date('2026-08-04T00:00:00') });
    // ALL 10 Paper items last counted in JULY (a real, big, qualifying-sized count) -- but
    // NOTHING has been touched in August at all.
    for (let i = 1; i <= 10; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-07-28T00:00:00') });
    const c = cadenceFromOnHand(rows, { asOf: asOfMid })[loc];
    expect(c.paperMissing).toBe(true);
    expect(c.uncountedPaper).toBe(10);   // NOT a small number just because July was touched
  });

  it('unions Paper progress across multiple sessions WITHIN the same period, not just the most recent one', () => {
    // Regression guard for a real bug found via live measurement (store 38609, 2026-08-25): Paper
    // counting can legitimately span more than one date in a period; a single-session pick
    // (by recency or by size) only ever sees one of those dates.
    const loc = 'PAPERMULTISESSION';
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date('2026-08-04T00:00:00') });
    for (let i = 1; i <= 3; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date('2026-08-04T00:00:00') });
    // 10 Paper items: 6 counted on 08-06, 3 MORE (disjoint) counted on 08-14, 1 never counted.
    for (let i = 1; i <= 6; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-08-06T00:00:00') });
    for (let i = 7; i <= 9; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-08-14T00:00:00') });
    rows.push({ loc, wrin: 'P10', descr: 'Paper 10', cls: 'Paper', active: true, onHandAmt: 8, lastCounted: null });
    const c = cadenceFromOnHand(rows, { asOf: asOfMid })[loc];
    expect(c.paperMissing).toBe(true);
    expect(c.uncountedPaper).toBe(1);   // only P10 -- NOT 4 (which a most-recent-session-only pick would give: 10 - 6)
    const paperRow = c.missing.find(b => b.cls === 'paper');
    expect(paperRow.items.map(u => u.descr)).toEqual(['Paper 10']);
  });

  it('reads Paper as N/A (null), not a misleading 0, before the mid-month window opens (day < 12)', () => {
    const c = cadenceFromOnHand(paperDueRows('PEARLY1'), { asOf: new Date('2026-08-05T00:00:00') })['PEARLY1'];
    expect(c.paperMissing).toBe(false);
    expect(c.uncountedPaper).toBeNull();
  });

  it('reads Paper as N/A once satisfied this month, even inside the window', () => {
    const loc = 'POK1';
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: new Date('2026-08-04T00:00:00') });
    for (let i = 1; i <= 3; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: new Date('2026-08-04T00:00:00') });
    // 10/10 Paper counted on 08-15 -- clears COVER_FRAC, satisfies the mid-month Paper requirement.
    for (let i = 1; i <= 10; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-08-15T00:00:00') });
    const c = cadenceFromOnHand(rows, { asOf: asOfMid })[loc];
    expect(c.paperMissing).toBe(false);
    expect(c.uncountedPaper).toBeNull();
  });

  it('does not misattribute a Paper-only gap as "Food/Condiment fully counted" when Food/Condiment were never touched at all this period', () => {
    // Regression guard for a real bug found while wiring this up: cycleClassCoverage() reads
    // "class absent from c.missing" as "that class was fully covered" -- true only when the array
    // came from an actual Food/Condiment diagnosis. A Paper-only missing entry must NOT make
    // Food/Condiment look complete.
    const loc = 'PAPERONLYNOFC';
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc, wrin: `F${i}`, descr: `Food ${i}`, cls: 'Food', active: true, onHandAmt: 10, lastCounted: null });
    for (let i = 1; i <= 3; i++) rows.push({ loc, wrin: `C${i}`, descr: `Cond ${i}`, cls: 'Condiment', active: false, onHandAmt: 5, lastCounted: null });
    for (let i = 1; i <= 6; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: new Date('2026-08-15T00:00:00') });
    for (let i = 7; i <= 10; i++) rows.push({ loc, wrin: `P${i}`, descr: `Paper ${i}`, cls: 'Paper', active: true, onHandAmt: 8, lastCounted: null });
    const c = cadenceFromOnHand(rows, { asOf: asOfMid })[loc];
    expect(c.paperMissing).toBe(true);
    expect(c.uncountedFood).toBe(5);          // NOT 0 -- nothing was actually counted
    expect(c.uncountedCondiment).toBe(3);     // NOT 0
  });

  it('renders the Uncounted F/C/P columns and the Paper item list in the drilldown, matching the existing Food/Condiment rendering style', () => {
    const cadenceByLoc = { [PAPER_DUE]: cadenceFromOnHand(paperDueRows(PAPER_DUE), { asOf: asOfMid })[PAPER_DUE] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const rows = [{ loc: PAPER_DUE, name: 'Paper Due Store' }];
    act(() => {
      root.render(React.createElement(CadenceMonitor, {
        rows, cadenceByLoc, rawByLoc: {}, fobRows: [], period: '2026-08', nm: () => '',
      }));
    });
    // Column header present.
    expect(container.textContent).toContain('Uncounted F/C/P');
    expect(container.textContent).toContain('Last count');
    // Row chips show the real counts (F 0, C 0, P 4).
    const row = findRow(container, 'Paper Due Store');
    expect(row.textContent).toContain('F 0');
    expect(row.textContent).toContain('C 0');
    expect(row.textContent).toContain('P 4');

    // Expand the row -- the drilldown must list the actual missed Paper items, not just a count.
    act(() => { row.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('paper');
    expect(container.textContent).toContain('4 items left');
    expect(container.textContent).toContain('Paper 7');
    expect(container.textContent).toContain('Paper 10');

    act(() => root.unmount());
    container.remove();
  });
});
