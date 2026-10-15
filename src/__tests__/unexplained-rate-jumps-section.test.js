// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-15: "You should be able to detect that as well from data pulls" --
// renders the REAL UnexplainedRateJumpsSection component (not detectAropJumps() in isolation,
// already covered in pay-events.test.js) so a revert of the wiring (section never calling the
// engine, or the "Log reason" button never opening the real modal) would fail this, per this
// repo's "would this verification still pass if reverted" rule.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { UnexplainedRateJumpsSection } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, savePayEvent: vi.fn(async () => ({ id: 'x', error: null })) };
});

// Rows anchored to REAL "now" (detectAropJumps with no asOf reads the real clock), spanning a
// 30-day buffer so the exact lastClosedBusinessDay() anchor (today or yesterday, depending on
// the 4am cutover at the moment the suite runs) always falls inside it.
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; }
function rateRows(loc, fromN, toN, avgRate, sales = 10000, actHrs = 250) {
  const laborPct = (avgRate * actHrs) / sales;
  const laborRows = [], qsrActSummaryRows = [];
  for (let n = fromN; n <= toN; n++) {
    const d = daysAgo(n);
    laborRows.push({ loc, date: d, laborPct, sales });
    qsrActSummaryRows.push({ loc, date: d, actHrs });
  }
  return { laborRows, qsrActSummaryRows };
}
function mergeDs(...parts) {
  return { laborRows: parts.flatMap(p => p.laborRows), qsrActSummaryRows: parts.flatMap(p => p.qsrActSummaryRows) };
}
const STORES = [{ loc: '10422' }, { loc: '13113' }];

describe('UnexplainedRateJumpsSection', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const clickLeaf = (text) => {
    const el = [...container.querySelectorAll('span,div,button')].find(e => e.children.length === 0 && e.textContent.includes(text));
    act(() => { el.click(); });
    return el;
  };

  it('flags a store with a real AROP jump and lets the owner log a reason, opening the real PayEventModal', () => {
    const ds = mergeDs(rateRows('10422', 0, 13, 10.5), rateRows('10422', 14, 29, 10));
    act(() => { root.render(React.createElement(UnexplainedRateJumpsSection, { ds, stores: STORES, onPayEventSaved: () => {} })); });
    clickLeaf('💰 Unexplained Rate Jumps'); // expand
    expect(container.textContent).toContain('Unexplained Rate Jumps (1)');

    clickLeaf('💰 Log reason');
    // CoachingModal/PayEventModal both render through ModalShell -- this title string is the
    // proof the REAL modal opened, pre-filled with the flagged store's loc.
    expect(container.textContent).toContain('Log Pay Event');
  });

  it('a logged pay event covering the jump window suppresses the flag', () => {
    const ds = mergeDs(rateRows('10422', 0, 13, 10.5), rateRows('10422', 14, 29, 10));
    // Local calendar date 7 days ago, not toISOString() of "today" -- that reads UTC (can land
    // on "tomorrow" in a negative-offset timezone) AND sits right at detectAropJumps' endKey
    // boundary, where the exact lastClosedBusinessDay() anchor (today or yesterday, depending
    // on the 4am cutover at the moment the suite runs) could tip it out of range. 7 days back
    // is safely inside the lookback window either way.
    const d = daysAgo(7);
    const localDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    ds.payEvents = [{ loc: '10422', effectiveDate: localDate }];
    act(() => { root.render(React.createElement(UnexplainedRateJumpsSection, { ds, stores: STORES, onPayEventSaved: () => {} })); });
    clickLeaf('💰 Unexplained Rate Jumps');
    expect(container.textContent).toContain('No unexplained AROP jumps right now.');
  });

  it('shows the empty state when no store has jumped', () => {
    const ds = mergeDs(rateRows('10422', 0, 29, 10)); // flat the whole time
    act(() => { root.render(React.createElement(UnexplainedRateJumpsSection, { ds, stores: STORES, onPayEventSaved: () => {} })); });
    clickLeaf('💰 Unexplained Rate Jumps');
    expect(container.textContent).toContain('No unexplained AROP jumps right now.');
  });
});
