// @vitest-environment happy-dom
// @ts-nocheck
// #367 — DI Compare's initial week anchor. MEASURED (not assumed) before fixing: the old
// formula `diff=(3-d.getDay()+7)%7||7; w.setDate(d.getDate()-diff*2)` computed the FORWARD
// distance to the next Wednesday, then subtracted it TWICE. Ran it against all 7 weekdays in
// Python and it lands on a DIFFERENT day of the week almost every time -- Mon/Thu/Sun/Wed/
// Sat/Tue/Fri across Sun-Sat -- correct only on the one day "today" happens to already be
// Wednesday. Fixed by routing through utils/date.js's weekStartOf, the shared helper this
// exact file's header exists to replace hand-rolled getDay() arithmetic with.
//
// This renders the real exported DialedInComparisonReport (not a reimplementation) with the
// system clock faked to each day of the week in turn, and asserts the initial "Week of …"
// text always names the same anchor day (Wednesday) -- the property the old formula violated
// for 6 of 7 days.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DialedInComparisonReport } from '../views/analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const baseProps = {
  stores: [{ loc: '10422' }],
  ds: { loaded: true },
  settings: {},
  userEvents: [],
  onClose: NOOP,
};

// Aug 16-22 2026 is a full Sun-Sat week (Aug 16 = Sunday). One weekday each.
const DAYS = [
  { label: 'Sun', date: '2026-08-16T09:00:00' },
  { label: 'Mon', date: '2026-08-17T09:00:00' },
  { label: 'Tue', date: '2026-08-18T09:00:00' },
  { label: 'Wed', date: '2026-08-19T09:00:00' },
  { label: 'Thu', date: '2026-08-20T09:00:00' },
  { label: 'Fri', date: '2026-08-21T09:00:00' },
  { label: 'Sat', date: '2026-08-22T09:00:00' },
];

describe('#367 DI Compare initial week anchor is stable across every day of the week', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  it.each(DAYS)('lands on a Wednesday week-start when today is $label', async ({ date }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(date));
    await act(async () => {
      root.render(React.createElement(DialedInComparisonReport, baseProps));
    });
    // The panel's own header text is 'Run Comparison — Week of <date>'; extract the date.
    const m = container.textContent.match(/Week of ([A-Za-z]+ \d{1,2}, \d{4})/);
    expect(m).toBeTruthy();
    const weekStartDate = new Date(m[1] + ' 12:00:00');
    expect(weekStartDate.getDay()).toBe(3); // 3 = Wednesday
  });

  it('is always exactly 7 days before this week\'s Wednesday, regardless of today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T09:00:00')); // Thursday
    await act(async () => {
      root.render(React.createElement(DialedInComparisonReport, baseProps));
    });
    const m = container.textContent.match(/Week of ([A-Za-z]+ \d{1,2}, \d{4})/);
    expect(m[1]).toBe('Aug 12, 2026'); // the Wednesday before this week's Wed (Aug 19)
  });
});
