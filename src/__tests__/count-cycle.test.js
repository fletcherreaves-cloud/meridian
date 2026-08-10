import { describe, it, expect } from 'vitest';
import { detectSessions, sessionKind, cycleCompliance, cycleSummary,
         inCloseWindow, lastDayOf, COVER_FRAC, WEEKLY_DUE_DAYS } from '../engine/count-cycle.js';

// Fixtures mirror the real shape of qsr_onhand rows and the real class universe measured
// live on 2026-08-07: a store carries roughly Food 115-120, Condiment 34-38, Paper 84-98.
const mk = (loc, cls, n, date, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${from + i}`, last_counted: date }));

/** A store with a full item universe, plus whatever sessions you specify. */
function store(loc, sessions = []) {
  const rows = [
    ...mk(loc, 'Food', 118, null), ...mk(loc, 'Condiment', 36, null),
    ...mk(loc, 'Paper', 92, null), ...mk(loc, 'Non-Product', 18, null),
  ];
  // Overwrite last_counted on the first N items of each class per session.
  for (const s of sessions) {
    for (const [cls, n] of Object.entries(s.counts)) {
      let done = 0;
      for (const r of rows) {
        if (r.cls === cls && done < n) { r.last_counted = s.date; done++; }
      }
    }
  }
  return rows;
}

describe('session classification', () => {
  it('a full Food + Condiment count is a weekly', () => {
    // Real example: store 6972 on 2026-08-06 counted Condiment 36, Food 118.
    const { sessions } = detectSessions(store('6972', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]));
    expect(sessions['6972'][0].kind).toBe('weekly');
  });

  it('a close-window count including Paper is an EOM', () => {
    const { sessions } = detectSessions(store('3708', [{ date: '2026-07-30', counts: { Food: 103, Condiment: 36, Paper: 92 } }]));
    expect(sessions['3708'][0].kind).toBe('eom');
  });

  it('a Paper count OUTSIDE the close window is the mid-month count', () => {
    // Paper is only counted mid-month and at close, so this is how the floating
    // mid-month count identifies itself — there is no fixed date to key on.
    const { sessions } = detectSessions(store('5985', [{ date: '2026-08-14', counts: { Paper: 90 } }]));
    expect(sessions['5985'][0].kind).toBe('mid-paper');
  });

  it('a substantial count that misses a weekly class is partial, not weekly', () => {
    // Real example: store 5183 on 2026-08-06 counted Food 58 of 118 and Condiment 5 of 36.
    const { sessions } = detectSessions(store('5183', [{ date: '2026-08-06', counts: { Food: 58, Condiment: 5 } }]));
    const s = sessions['5183'][0];
    expect(s.kind).toBe('partial');
    expect(s.covered).not.toContain('Food');
    expect(s.covered).not.toContain('Condiment');
  });

  it('a handful of items is a spot check, not a failed weekly', () => {
    // Real example: store 5985 on 2026-08-05 counted 12 Food items. Calling that a
    // failed weekly count would cry wolf at a store doing ordinary spot checks.
    const { sessions } = detectSessions(store('5985', [{ date: '2026-08-05', counts: { Food: 12 } }]));
    expect(sessions['5985'][0].kind).toBe('spot');
  });

  it('records the class universe so coverage is measured, not assumed', () => {
    const { classTotals } = detectSessions(store('1234'));
    expect(classTotals['1234']).toEqual({ Food: 118, Condiment: 36, Paper: 92, 'Non-Product': 18 });
  });

  it('tolerates zero-padded locs, as qsr_onhand stores them', () => {
    const { sessions } = detectSessions(store('0005985', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]));
    expect(sessions['5985']).toBeTruthy();
  });
});

describe("the owner's weekly rule", () => {
  it('passes a store that counted Food AND Condiment', () => {
    const c = cycleCompliance(store('A', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]), { asOf: '2026-08-07' });
    expect(c[0].status).toBe('ok');
    expect(c[0].exceptions).toEqual([]);
  });

  it('flags a store that counted Food but not Condiment', () => {
    const c = cycleCompliance(store('A', [
      { date: '2026-07-30', counts: { Food: 118, Condiment: 36, Paper: 92 } },   // EOM
      { date: '2026-08-06', counts: { Food: 118, Condiment: 4 } },               // weekly, no condiment
    ]), { asOf: '2026-08-07' });
    const ex = c[0].exceptions.find(e => e.rule === 'weekly-incomplete');
    expect(ex).toBeTruthy();
    expect(ex.detail).toContain('Condiment');
  });

  it('flags a store with no complete count on record as critical', () => {
    const c = cycleCompliance(store('A', [{ date: '2026-08-06', counts: { Food: 10 } }]), { asOf: '2026-08-07' });
    expect(c[0].status).toBe('crit');
    expect(c[0].exceptions[0].rule).toBe('weekly-overdue');
  });

  it('flags a store overdue past the grace period', () => {
    const c = cycleCompliance(store('A', [{ date: '2026-07-26', counts: { Food: 118, Condiment: 36 } }]), { asOf: '2026-08-07' });
    const ex = c[0].exceptions.find(e => e.rule === 'weekly-overdue');
    expect(ex.severity).toBe('crit');
    expect(ex.detail).toContain('12 days');
  });

  it('does not flag a store still inside the grace window', () => {
    // The count day floats, so 7 days exactly must not fire.
    const c = cycleCompliance(store('A', [{ date: '2026-07-31', counts: { Food: 118, Condiment: 36 } }]), { asOf: '2026-08-07' });
    expect(c[0].overdue).toBe(false);
  });
});

describe("the owner's mid-month paper rule", () => {
  const weekly = { date: '2026-08-14', counts: { Food: 118, Condiment: 36 } };

  it('flags a missing mid-month Paper count once it is due', () => {
    const c = cycleCompliance(store('A', [weekly]), { asOf: '2026-08-17' });
    const ex = c[0].exceptions.find(e => e.rule === 'mid-month-paper');
    expect(ex).toBeTruthy();
    expect(ex.detail).toContain('next weekly count at the latest');
  });

  it('is satisfied by a Paper count outside the close window', () => {
    const c = cycleCompliance(store('A', [
      { date: '2026-08-14', counts: { Food: 118, Condiment: 36, Paper: 92 } },
    ]), { asOf: '2026-08-17' });
    expect(c[0].paperThisMonth).toBe(true);
    expect(c[0].exceptions.find(e => e.rule === 'mid-month-paper')).toBeFalsy();
  });

  it('does not nag early in the month, before the count is due', () => {
    const c = cycleCompliance(store('A', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]), { asOf: '2026-08-07' });
    expect(c[0].paperMissing).toBe(false);
  });

  it('stops nagging inside the close window, when EOM covers Paper anyway', () => {
    const c = cycleCompliance(store('A', [{ date: '2026-08-25', counts: { Food: 118, Condiment: 36 } }]), { asOf: '2026-08-30' });
    expect(c[0].paperMissing).toBe(false);
  });
});

describe('date helpers', () => {
  it('knows month lengths including February', () => {
    expect(lastDayOf('2026-02-10')).toBe(28);
    expect(lastDayOf('2026-08-10')).toBe(31);
    expect(lastDayOf('2026-09-10')).toBe(30);
  });

  it('identifies the close window relative to each month length', () => {
    expect(inCloseWindow('2026-08-29')).toBe(true);
    expect(inCloseWindow('2026-08-27')).toBe(false);
    expect(inCloseWindow('2026-02-26')).toBe(true);   // Feb 26 of 28
  });
});

describe('robustness and rollup', () => {
  it('handles empty input', () => {
    expect(cycleCompliance([])).toEqual([]);
    expect(cycleCompliance()).toEqual([]);
    expect(cycleSummary([])).toMatchObject({ stores: 0 });
  });

  it('ignores rows with no class', () => {
    const { sessions } = detectSessions([{ loc: 'A', wrin: 'x', last_counted: '2026-08-01' }]);
    expect(sessions).toEqual({});
  });

  it('summarises the district', () => {
    const rows = [
      ...store('A', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]),
      ...store('B', [{ date: '2026-06-01', counts: { Food: 118, Condiment: 36 } }]),
    ];
    const s = cycleSummary(cycleCompliance(rows, { asOf: '2026-08-07' }));
    expect(s.stores).toBe(2);
    expect(s.ok).toBe(1);
    expect(s.crit).toBe(1);
    expect(s.overdue).toBe(1);
  });

  it('thresholds are the measured values', () => {
    expect(COVER_FRAC).toBe(0.75);
    expect(WEEKLY_DUE_DAYS).toBe(9);
  });
});

describe('row-shape compatibility', () => {
  // loadQsrOnHand returns camelCase with a Date; the pull script and raw REST return
  // snake_case with an ISO string. Supporting only one silently reports every store as
  // never-counted, which would look like a data outage rather than a bug.
  const universe = (shape) => [
    ...Array.from({ length: 118 }, (_, i) => ({ loc: 'A', cls: 'Food', wrin: `F${i}`, ...shape(i, 'Food') })),
    ...Array.from({ length: 36 }, (_, i) => ({ loc: 'A', cls: 'Condiment', wrin: `C${i}`, ...shape(i, 'Condiment') })),
  ];

  it('reads the DB shape: last_counted as an ISO string', () => {
    const rows = universe(() => ({ last_counted: '2026-08-06' }));
    expect(cycleCompliance(rows, { asOf: '2026-08-07' })[0].status).toBe('ok');
  });

  it('reads the app shape: lastCounted as a Date', () => {
    const rows = universe(() => ({ lastCounted: new Date('2026-08-06T00:00:00') }));
    const c = cycleCompliance(rows, { asOf: '2026-08-07' });
    expect(c[0].status).toBe('ok');
    expect(c[0].lastWeekly.date).toBe('2026-08-06');
  });

  it('ignores an invalid Date rather than crashing', () => {
    const rows = universe(() => ({ lastCounted: new Date('nonsense') }));
    expect(() => cycleCompliance(rows, { asOf: '2026-08-07' })).not.toThrow();
  });
});
