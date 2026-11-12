// Follow-up to the Daypart Pace UTC-date fix (2026-11-12, commit 6f431926): a grep for the same
// `new Date().toISOString().slice(0,10)` anti-pattern across src/ turned up 55 files. Most are
// harmless (export filenames, cosmetic report-generated timestamps) -- this file covers the ones
// that genuinely compute "today" to GATE or GRADE live data (compliance verdicts, GM-of-record
// lookups, missing-day detection), the same bug class as Daypart Pace: during the ~6 evening
// hours where the UTC calendar day has rolled over but local wall-clock time hasn't (6pm CST,
// 7pm CDT onward), these used to grade/resolve "as of tomorrow" instead of "as of today".
//
// Each exported function here is fixed to fall back to businessDate() (utils/date.js) instead.
// Tests force TZ=America/Chicago (set before any Date is constructed, restored after) -- the
// default test-runner TZ is UTC, where local time == UTC and this bug class can't be reproduced
// at all (no UTC/local gap to expose). Same pattern as dispatch-daypart-pace-utc-date-bug-2026-11-12.test.js.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

// 2026-11-12T00:48:00Z == 2026-11-11T18:48:00 CST -- the exact owner-reported timestamp
// (6:48pm CST, "it is currently... this is looking as though it is already tomorrow").
const EVENING_NOW = () => new Date('2026-11-12T00:48:00Z');

describe('cycleCompliance()/complianceFromSessions() grade against the real local business day', () => {
  // Same qsr_onhand-shaped per-item row fixture count-cycle.test.js's own mk()/store() helpers
  // use: one row per WRIN, last_counted stamped on the N items that were actually touched.
  const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));

  it('a store with a real complete weekly count TODAY (local) is graded on-cycle, not overdue against a UTC "tomorrow"', async () => {
    const { cycleCompliance } = await import('../engine/count-cycle.js');
    // A complete Food+Condiment weekly count on 2026-11-11 (the real local "today" at 6:48pm CST).
    const rows = [...mk('3708', 'Food', 118, '2026-11-11'), ...mk('3708', 'Condiment', 36, '2026-11-11')];
    // No asOf passed -- exercises the live "right now" fallback, not a test-supplied date.
    const realNow = Date;
    global.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : [EVENING_NOW()])); } static now() { return EVENING_NOW().getTime(); } };
    try {
      const c = cycleCompliance(rows, {})[0];
      // The old bug resolved "today" to the UTC day (one ahead at this exact evening instant),
      // which would read this same-day count as already a day old.
      expect(c.daysSinceWeekly).toBe(0);
    } finally {
      global.Date = realNow;
    }
  });
});

describe('cadenceFromOnHand() grades daysSinceWeekly against the real local today, not a UTC "tomorrow"', () => {
  const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));

  it('a complete weekly count TODAY (local, 6:48pm CST) reads 0 days since, not 1', async () => {
    const { cadenceFromOnHand } = await import('../views/eom-dashboard.js');
    const rows = [...mk('3708', 'Food', 118, '2026-11-11'), ...mk('3708', 'Condiment', 36, '2026-11-11')];
    const realNow = Date;
    global.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : [EVENING_NOW()])); } static now() { return EVENING_NOW().getTime(); } };
    try {
      // No asOf passed -- exercises the live default, which used to resolve to the UTC calendar
      // day (one day ahead of the real local "today" at this exact evening instant).
      const cadenceByLoc = cadenceFromOnHand(rows);
      expect(cadenceByLoc['3708'].daysSinceWeekly).toBe(0);
    } finally {
      global.Date = realNow;
    }
  });
});

describe('computeMissingWasteDays()/computeStoreDataDiscipline() grade against the real local day', () => {
  it('the real tomorrow (which has not happened yet) is never checked for a missing entry against a UTC "tomorrow" compare', async () => {
    const { computeMissingWasteDays } = await import('../engine/waste-discipline.js');
    // A real entry every single day for the full LOOKBACK_DAYS (56) window through 2026-11-11
    // (the real local "today" at 6:48pm CST) establishes every day-of-week as an expected
    // pattern at a 100% hit rate. 2026-11-12 (the real tomorrow) deliberately has no entry -- it
    // hasn't happened yet.
    const dates = [];
    for (let d = new Date('2026-09-17T12:00:00'); d <= new Date('2026-11-11T12:00:00'); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    const rows = dates.map(dt => ({ loc: '3708', type: 'raw', dt }));
    const realNow = Date;
    global.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : [EVENING_NOW()])); } static now() { return EVENING_NOW().getTime(); } };
    try {
      const missing = computeMissingWasteDays(rows);
      const m = missing['3708']?.raw;
      // The old bug resolved "today" to the UTC day (2026-11-12 at this exact instant), which
      // would extend the trailing window one day into a future that has no data to find -- and
      // flag it missing. Fixed, the window stops at the real local today.
      expect(m?.missingDates || []).not.toContain('2026-11-12');
      expect(m?.missingDates || []).not.toContain('2026-11-11'); // today itself has a real entry
    } finally {
      global.Date = realNow;
    }
  });
});

describe('setLiveGmAssignments()/gmAssignments() resolve the current GM against the real local day', () => {
  it('a GM transition NOT effective until the real tomorrow is not pulled in a day early by a UTC "tomorrow" compare', async () => {
    const { setLiveGmAssignments, gmAssignments } = await import('../engine/contact-directory.js');
    // New GM's start date is the REAL tomorrow (2026-11-12) -- at 6:48pm CST on the 11th, that
    // transition has not happened yet. The old bug compared against the UTC day (also "2026-11-12"
    // at this exact instant), which would make `2026-11-12 <= today` true a day early and hand
    // the store to the incoming GM before their start date actually arrives.
    const assignments = [
      { loc: '3708', start: '2026-01-01', gm: 'Old GM', gmEmail: 'old@example.com' },
      { loc: '3708', start: '2026-11-12', gm: 'New GM', gmEmail: 'new@example.com' },
    ];
    const realNow = Date;
    global.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : [EVENING_NOW()])); } static now() { return EVENING_NOW().getTime(); } };
    try {
      setLiveGmAssignments(assignments);
      expect(gmAssignments()).toEqual(assignments);
      // STORE_STAFF is this same module's own shared object, mutated in place as a side effect --
      // read it back the same way the real consumers (pipeline.js, report recipients) do.
      const { STORE_STAFF } = await import('../engine/contact-directory.js');
      expect(STORE_STAFF['3708']?.gm).toBe('Old GM');
    } finally {
      global.Date = realNow;
    }
  });
});
