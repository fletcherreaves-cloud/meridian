import { describe, it, expect } from 'vitest';
import { detectSessions, sessionQualities, sessionLabel, cycleCompliance, cycleSummary,
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
  it('a full Food + Condiment count satisfies weekly', () => {
    // Real example: store 6972 on 2026-08-06 counted Condiment 36, Food 118.
    const { sessions } = detectSessions(store('6972', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]));
    const s = sessions['6972'][0];
    expect(s.satisfiesWeekly).toBe(true);
    expect(s.isEom).toBe(false);
    expect(s.satisfiesMidPaper).toBe(false);
    expect(s.kind).toBe('Weekly');
  });

  it('a close-window count including Paper satisfies EOM', () => {
    const { sessions } = detectSessions(store('3708', [{ date: '2026-07-30', counts: { Food: 103, Condiment: 36, Paper: 92 } }]));
    const s = sessions['3708'][0];
    expect(s.isEom).toBe(true);
    // #357-A — an EOM session ALSO satisfies the weekly requirement independently
    // (it covers Food+Condiment too); the old single-label 'eom' hid that.
    expect(s.satisfiesWeekly).toBe(true);
  });

  it('a Paper count OUTSIDE the close window satisfies mid-month paper', () => {
    // Paper is only counted mid-month and at close, so this is how the floating
    // mid-month count identifies itself — there is no fixed date to key on.
    const { sessions } = detectSessions(store('5985', [{ date: '2026-08-14', counts: { Paper: 90 } }]));
    const s = sessions['5985'][0];
    expect(s.satisfiesMidPaper).toBe(true);
    expect(s.satisfiesWeekly).toBe(false);
    expect(s.isEom).toBe(false);
  });

  // #357-A — the actual owner-reported case: Marietta 33109's 2026-08-11 session
  // covered Cond 33/33, Food 112/112, Pape 85/~90 — ALL THREE classes over threshold,
  // outside the close window. The pre-fix if/else chain returned 'mid-paper' on the
  // Paper check and never reached the weekly check, so lastWeekly (which only matched
  // kind==='weekly'||'eom') found nothing and the store reported "No complete weekly
  // count on record" — CRITICAL — on the day it did the most complete count of the
  // month. Independent flags must both be true on the SAME session.
  it('a session covering Food+Condiment+Paper outside the close window satisfies BOTH weekly and mid-paper (Marietta 2026-08-11)', () => {
    const { sessions } = detectSessions(store('33109', [
      { date: '2026-08-11', counts: { Condiment: 33, Food: 112, Paper: 85 } },
    ]));
    const s = sessions['33109'][0];
    expect(s.satisfiesWeekly).toBe(true);
    expect(s.satisfiesMidPaper).toBe(true);
    expect(s.isEom).toBe(false);
    expect(s.kind).toBe('Weekly + Mid-month paper');
  });

  it('a substantial count that misses a weekly class is partial, not weekly', () => {
    // Real example: store 5183 on 2026-08-06 counted Food 58 of 118 and Condiment 5 of 36.
    const { sessions } = detectSessions(store('5183', [{ date: '2026-08-06', counts: { Food: 58, Condiment: 5 } }]));
    const s = sessions['5183'][0];
    expect(s.isPartial).toBe(true);
    expect(s.satisfiesWeekly).toBe(false);
    expect(s.covered).not.toContain('Food');
    expect(s.covered).not.toContain('Condiment');
  });

  it('a handful of items is a spot check, not a failed weekly', () => {
    // Real example: store 5985 on 2026-08-05 counted 12 Food items. Calling that a
    // failed weekly count would cry wolf at a store doing ordinary spot checks.
    const { sessions } = detectSessions(store('5985', [{ date: '2026-08-05', counts: { Food: 12 } }]));
    expect(sessions['5985'][0].isSpot).toBe(true);
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

// #357 — the two owner-reported real cases (Marietta 33109, Tecumseh 33704, as of
// 2026-08-16). Both go RED against the pre-#357 engine — confirmed by running this suite
// against a stash of the unfixed count-cycle.js before restoring the fix.
describe('#357 regression — real production cases', () => {
  it('Marietta 33109: one session covering Food+Condiment+Paper is credited for BOTH weekly and mid-month paper, and the store is not CRITICAL (#357-A)', () => {
    // Real 2026-08-11 session: Cond 33/33, Food 112/112, Pape 85/85 (all three classes
    // fully counted, in one session, outside the close window).
    const rows = [
      ...mk('33109', 'Food', 112, '2026-08-11'),
      ...mk('33109', 'Condiment', 33, '2026-08-11'),
      ...mk('33109', 'Paper', 85, '2026-08-11'),
    ];
    const c = cycleCompliance(rows, { asOf: '2026-08-16' });
    // Pre-fix: sessionKind returned 'mid-paper' first, lastWeekly found nothing, and the
    // store reported "No complete weekly count on record" — CRITICAL.
    expect(c[0].status).not.toBe('crit');
    expect(c[0].status).toBe('ok');
    expect(c[0].lastWeekly).toBeTruthy();
    expect(c[0].lastWeekly.date).toBe('2026-08-11');
    expect(c[0].paperThisMonth).toBe(true);
    expect(c[0].exceptions).toEqual([]);
  });

  it('Tecumseh 33704: a Paper-only session the day after a complete weekly does not trigger a false "not fully counted" warning (#357-B1)', () => {
    // Real: Cond 37/37 + Food 117/117 on 08-14 (a complete weekly), then Paper 79 of a
    // 107-item universe on 08-15 (73.8% — below COVER_FRAC, so not yet "covered" under
    // the unchanged 0.75 threshold; #357-B2/3 is the separate fix for THAT number).
    const rows = [
      ...mk('33704', 'Food', 117, '2026-08-14'),
      ...mk('33704', 'Condiment', 37, '2026-08-14'),
      ...mk('33704', 'Paper', 107, null),
    ];
    let done = 0;
    for (const r of rows) {
      if (r.cls === 'Paper' && done < 79) { r.last_counted = '2026-08-15'; done++; }
    }
    const c = cycleCompliance(rows, { asOf: '2026-08-16' });
    // Pre-fix: lastPartial (the 08-15 Paper session, which failed the coverage
    // threshold) is newer than lastWeekly (08-14) → fired "Counted 2026-08-15 but Food
    // and Condiment not fully counted", even though 08-15 never touched either class.
    expect(c[0].exceptions.find(e => e.rule === 'weekly-incomplete')).toBeFalsy();
    expect(c[0].lastWeekly.date).toBe('2026-08-14');
  });
});

// #357-B2/3 — the denominator must be ACTIVE items, not "every WRIN the API ever returned."
// Measured live (DUMP_RAW_FIELDS probe, 2026-08-17): active_in_recipe genuinely varies
// (1: 4807, 0: 2320 across 7127 items) rather than being a constant, so it's a real filter.
describe('#357-B2/3 active-item denominator', () => {
  it('excludes inactive items from the class universe (classTotals)', () => {
    const rows = [
      ...mk('A', 'Food', 100, null).map(r => ({ ...r, active: true })),
      ...mk('A', 'Food', 20, null, 100).map(r => ({ ...r, active: false })),   // discontinued, residual on-hand
      ...mk('A', 'Condiment', 30, null).map(r => ({ ...r, active: true })),
    ];
    const { classTotals } = detectSessions(rows);
    // 100 active Food, not 120 -- the 20 inactive items must not inflate the denominator.
    expect(classTotals['A'].Food).toBe(100);
    expect(classTotals['A'].Condiment).toBe(30);
  });

  it('treats a missing/null active field as active (backward-compatible with pre-migration rows)', () => {
    const rows = mk('A', 'Food', 118, null); // no `active` key at all, same as every existing fixture
    const { classTotals } = detectSessions(rows);
    expect(classTotals['A'].Food).toBe(118);
  });

  it('a count of an inactive item does not count toward coverage of the active universe', () => {
    const rows = [
      ...mk('A', 'Food', 90, null).map((r, i) => ({ ...r, active: true, last_counted: i < 90 ? '2026-08-06' : null })),
      ...mk('A', 'Food', 10, '2026-08-06', 90).map(r => ({ ...r, active: false })),  // 10 inactive items also counted the same day
      ...mk('A', 'Condiment', 36, '2026-08-06').map(r => ({ ...r, active: true })),
    ];
    const { sessions, classTotals } = detectSessions(rows);
    // Active universe is 90 Food (the 10 inactive ones excluded), and all 90 were counted
    // -- full coverage -- even though 10 additional (inactive) items were also touched.
    expect(classTotals['A'].Food).toBe(90);
    const s = sessions['A'][0];
    expect(s.counts.Food).toBe(90);
    expect(s.satisfiesWeekly).toBe(true);
  });

  it('a discontinued item with a stale last_counted no longer masks an otherwise-overdue store', () => {
    // The Durant #5985 case, generalized: a store's active universe is fully counted, but
    // an inactive item that was counted long ago must not artificially help OR hurt the
    // active-only compliance check -- it is simply excluded either way.
    const rows = [
      ...mk('A', 'Food', 118, '2026-08-06').map(r => ({ ...r, active: true })),
      ...mk('A', 'Condiment', 36, '2026-08-06').map(r => ({ ...r, active: true })),
      { loc: 'A', cls: 'Food', wrin: 'discontinued-1', last_counted: '2026-01-01', active: false },
    ];
    const c = cycleCompliance(rows, { asOf: '2026-08-07' });
    expect(c[0].status).toBe('ok');
    expect(c[0].classTotals.Food).toBe(118); // the discontinued item is not in the denominator
  });
});

// #357-5 — the panel's per-class "counted / active" display, sourced from cycleCompliance's
// new `perClass` field.
describe('#357-5 perClass (counted / active per class)', () => {
  it('reports counted from the most recent session that touched each class, against the active denominator', () => {
    const rows = [
      ...mk('A', 'Food', 118, '2026-08-06').map(r => ({ ...r, active: true })),
      ...mk('A', 'Condiment', 36, '2026-08-06').map(r => ({ ...r, active: true })),
    ];
    const c = cycleCompliance(rows, { asOf: '2026-08-07' });
    expect(c[0].perClass.Food).toEqual({ active: 118, counted: 118, date: '2026-08-06' });
    expect(c[0].perClass.Condiment).toEqual({ active: 36, counted: 36, date: '2026-08-06' });
    expect(c[0].perClass.Paper).toEqual({ active: 0, counted: 0, date: null });
  });

  it('picks up the LATER of two sessions touching the same class, not the first', () => {
    const rows = [
      ...mk('A', 'Food', 118, null).map((r, i) => ({ ...r, active: true, last_counted: i < 60 ? '2026-08-01' : '2026-08-08' })),
    ];
    const c = cycleCompliance(rows, { asOf: '2026-08-09' });
    expect(c[0].perClass.Food.date).toBe('2026-08-08');
    expect(c[0].perClass.Food.counted).toBe(58);
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
