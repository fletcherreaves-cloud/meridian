import { describe, it, expect } from 'vitest';
import { detectSessions, sessionQualities, sessionLabel, cycleCompliance, cycleSummary,
         inCloseWindow, lastDayOf, COVER_FRAC, WEEKLY_DUE_DAYS, detectWeeklyCountDay,
         formatWeeklyComplianceReport } from '../engine/count-cycle.js';

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

// Dispatch16 (#374 KB verification, 2026-08-18) — active=false is not one population. The
// QSRSoft KB splits it into Topic 3 (not in any recipe — correctly excluded above) and
// Topic 6 (not active but part of an ACTIVE recipe — still real to-count work). Measured
// live: of 2316 active=false items, 144 (6.2%) are recipeItem=true, i.e. genuine Topic 6.
describe('dispatch16 — Topic 6 rescue (recipeItem overrides active=false)', () => {
  it('rescues a Topic-6 item (active=false, recipeItem=true) into the denominator', () => {
    const rows = [
      ...mk('A', 'Food', 100, null).map(r => ({ ...r, active: true })),
      ...mk('A', 'Food', 5, null, 100).map(r => ({ ...r, active: false, recipeItem: true })), // Topic 6
    ];
    const { classTotals } = detectSessions(rows);
    // 105, not 100 -- the 5 Topic-6 items must NOT be dropped just because active===false.
    expect(classTotals['A'].Food).toBe(105);
  });

  it('still excludes a Topic-3-like item (active=false, recipeItem=false) -- the fix does not become a no-op', () => {
    const rows = [
      ...mk('A', 'Food', 100, null).map(r => ({ ...r, active: true })),
      ...mk('A', 'Food', 5, null, 100).map(r => ({ ...r, active: false, recipeItem: false })), // Topic 3
    ];
    const { classTotals } = detectSessions(rows);
    expect(classTotals['A'].Food).toBe(100);
  });

  it('a Topic-6 rescued item can satisfy weekly coverage when counted', () => {
    const rows = [
      ...mk('A', 'Food', 90, '2026-08-06').map(r => ({ ...r, active: true })),
      ...mk('A', 'Food', 1, '2026-08-06', 90).map(r => ({ ...r, active: false, recipeItem: true })), // Topic 6, counted
      ...mk('A', 'Condiment', 36, '2026-08-06').map(r => ({ ...r, active: true })),
    ];
    const { sessions, classTotals } = detectSessions(rows);
    expect(classTotals['A'].Food).toBe(91);
    expect(sessions['A'][0].counts.Food).toBe(91);
    expect(sessions['A'][0].satisfiesWeekly).toBe(true);
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

// Dispatch20 §3 investigation, 2026-08-18 — "all 27 stores read crit/weekly-overdue on one
// day" (surfaced in #410, chased per the dispatch's own instruction: re-grade against several
// asOf dates before theorizing; every date read crit, which is the discriminator for a logic
// bug, not a stale feed). Root cause measured live: 967/978 (98.9%) of ALL Condiment-class
// qsr_onhand rows district-wide read active=false, none Topic-6-rescued (recipe_item never
// true for a Condiment row in the pulled data) -- leaving totals[loc].Condiment at 0 or
// undefined for 17/27 stores. The old `(totals[loc][c] || Infinity) * COVER_FRAC` threshold
// made a 0-item class permanently uncoverable: no session, however complete, could ever
// satisfy `has('Condiment')`, so satisfiesWeekly was mathematically impossible regardless of
// what the store actually counted.
//
// SUPERSEDED CLASS CHOICE, 2026-08-24 (dispatch #96): this describe block originally used
// Condiment (Bonifay, 10034) as its real-world example, because Condiment was measured to be
// the class that actually hits zero-universe in production. Dispatch #96 fixed Condiment by a
// different, more specific mechanism -- it now bypasses the active/recipe_item check entirely
// (see the "dispatch #96" describe block below), so Condiment can no longer reach zero-universe
// at all and is no longer a valid example of THIS generic mechanism. The `universe === 0 →
// trivially covered` line in detectSessions() is still real code, still guarding Food/Paper/
// Non-Product against the same trap should any of them ever go fully inactive district-wide, so
// this block now demonstrates it synthetically with Food instead of retiring the coverage.
describe('zero-active-item class cannot permanently block compliance', () => {
  const noActiveFood = (sessions = []) => {
    const rows = [
      // Food rows exist in the RAW data (119 of them) but every single one reads
      // active:false, recipeItem:false -- so NONE contribute to totals['10034'].Food, which
      // the fix must not choke on. (Synthetic: real Food data does not do this -- see the
      // note above on why Condiment, the class that really does, moved to its own block.)
      ...Array.from({ length: 119 }, (_, i) => ({ loc: '10034', cls: 'Food', wrin: `F${i}`, active: false, recipeItem: false, last_counted: null })),
      ...mk('10034', 'Condiment', 36, null),
      ...mk('10034', 'Paper', 74, null),
      ...mk('10034', 'Non-Product', 5, null),
    ];
    for (const s of sessions) {
      for (const [cls, n] of Object.entries(s.counts)) {
        let done = 0;
        for (const r of rows) {
          if (r.cls === cls && r.active !== false && done < n) { r.last_counted = s.date; done++; }
        }
      }
    }
    return rows;
  };

  it('totals.Food is 0/undefined when every Food row reads inactive', () => {
    const { classTotals } = detectSessions(noActiveFood());
    expect(classTotals['10034'].Food).toBeUndefined();
    expect(classTotals['10034'].Condiment).toBe(36);
  });

  it('a complete Condiment count alone now satisfies weekly -- Food is trivially covered, ' +
     'not permanently blocking (the bug: this used to be impossible no matter what)', () => {
    const rows = noActiveFood([{ date: '2026-08-12', counts: { Condiment: 36 } }]);
    const { sessions } = detectSessions(rows);
    const s = sessions['10034'][0];
    expect(s.covered).toContain('Food'); // trivially covered -- nothing active to count
    expect(s.covered).toContain('Condiment');
    expect(s.satisfiesWeekly).toBe(true);
    expect(s.kind).toBe('Weekly');
  });

  it('cycleCompliance no longer grades this store permanently crit -- a complete Condiment ' +
     'count satisfies the weekly-overdue check (Paper is a separate, correctly-still-required ' +
     'rule, not touched by this fix -- it fires "warn" here because no Paper session happened, ' +
     'which is real and correct, not the bug)', () => {
    const rows = noActiveFood([{ date: '2026-08-12', counts: { Condiment: 36 } }]);
    const c = cycleCompliance(rows, { asOf: '2026-08-14' });
    expect(c[0].status).toBe('warn'); // NOT 'crit' -- weekly-overdue no longer fires
    expect(c[0].exceptions.map(e => e.rule)).toEqual(['mid-month-paper']);
    expect(c[0].lastWeekly).not.toBeNull();
  });

  it('a store WITH real active Food items still requires counting them -- the fix only ' +
     'exempts a class with ZERO active items, it does not weaken the rule generally', () => {
    const rows = [
      { loc: 'X', cls: 'Food', wrin: 'F1', active: true, last_counted: null },
      { loc: 'X', cls: 'Food', wrin: 'F2', active: true, last_counted: null },
      ...mk('X', 'Condiment', 36, '2026-08-12'),
    ];
    // Count Condiment fully, but never touch the 2 active Food items.
    const { sessions } = detectSessions(rows);
    const s = sessions['X'][0];
    expect(s.covered).not.toContain('Food'); // 2 active items exist and were never counted
    expect(s.satisfiesWeekly).toBe(false);
  });
});

// Dispatch #96 (2026-08-24) — Condiment is a STRUCTURAL exception, not a further instance of
// the zero-active-universe bug above. Live pull (qsr_onhand, period=2026-08, all 27 stores,
// 996 Condiment rows): active/recipe_item are (false,false) for 986 rows and (null,null) for
// the other 10 -- TRUE occurs zero times, for either flag, on any Condiment row, ever. That
// left two broken outcomes: 17/27 stores hit the zero-universe bypass above (vacuously "always
// covered," measuring nothing), and 10/27 stores had exactly one stray active:null row become
// their ENTIRE Condiment universe -- for Tecumseh (33704) that lone row was a stale, $0,
// pre-period phantom (last_counted 2026-07-31, before August's count cycle even started),
// making Condiment permanently uncoverable despite ~39 real items counted 2026-08-21/22. This
// fixture mirrors that exact production shape: a Tecumseh-like store with a 39-item real
// Condiment universe (all active:false, matching the measured 986-row population) PLUS the one
// stale active:null phantom row, then a real 2026-08-21 session counting the 38 non-phantom
// items -- run through the actual cycleCompliance()/detectSessions() consumer, per this repo's
// "would this verification still pass if reverted" standing rule.
describe('dispatch #96 — Condiment bypasses active/recipe_item entirely (structural, not a data gap)', () => {
  const tecumsehLike = (sessions = []) => {
    const rows = [
      ...mk('33704', 'Food', 117, null),
      ...mk('33704', 'Paper', 107, null),
      ...mk('33704', 'Non-Product', 12, null),
      // 38 real Condiment items, all active:false (matches the measured 986-row population --
      // McDonald's condiments are never recipe-bound, so this flag is never true for this class).
      ...mk('33704', 'Condiment', 38, null).map(r => ({ ...r, active: false, recipeItem: false })),
      // The one stray phantom row that, pre-fix, WAS the entire universe: active:null,
      // last_counted before the current count period even opened.
      { loc: '33704', cls: 'Condiment', wrin: 'phantom-1', active: null, recipeItem: null,
        last_counted: '2026-07-31', on_hand_amt: 0 },
    ];
    for (const s of sessions) {
      for (const [cls, n] of Object.entries(s.counts)) {
        let done = 0;
        for (const r of rows) {
          if (r.cls === cls && r.wrin !== 'phantom-1' && done < n) { r.last_counted = s.date; done++; }
        }
      }
    }
    return rows;
  };

  it('the Condiment universe is the real ~39-item count, not the 1 stale phantom row', () => {
    const { classTotals } = detectSessions(tecumsehLike());
    expect(classTotals['33704'].Condiment).toBe(39); // 38 real + 1 phantom, both count now
    expect(classTotals['33704'].Food).toBe(117); // other classes' universes are untouched
  });

  it('a real Food+Condiment count satisfies weekly coverage on a genuine percentage basis, ' +
     'not via the zero-universe vacuous bypass', () => {
    const rows = tecumsehLike([
      { date: '2026-08-21', counts: { Food: 117, Condiment: 38 } }, // the 38 real items
    ]);
    const { sessions } = detectSessions(rows);
    // Two sessions exist: the phantom row's own stale 2026-07-31 date, and the real 08-21
    // count -- find the real one by date rather than assuming index 0 (sessions sort by date).
    const s = sessions['33704'].find(x => x.date === '2026-08-21');
    // 38 of 39 = 97.4%, well over COVER_FRAC (0.75) -- a real percentage, not a trivial pass.
    expect(s.covered).toContain('Condiment');
    expect(s.satisfiesWeekly).toBe(true);
    expect(s.kind).toContain('Weekly');
  });

  it('cycleCompliance no longer reads Overdue for this mechanism -- Tecumseh\'s 08-21 count ' +
     'clears weekly-overdue', () => {
    const rows = tecumsehLike([{ date: '2026-08-21', counts: { Food: 117, Condiment: 38 } }]);
    const c = cycleCompliance(rows, { asOf: '2026-08-24' });
    expect(c[0].overdue).toBe(false);
    expect(c[0].exceptions.find(e => e.rule === 'weekly-overdue')).toBeFalsy();
    expect(c[0].lastWeekly.date).toBe('2026-08-21');
  });

  it('a store with an all-false Condiment population (the 17-store vacuous-bypass case) now ' +
     'gets a REAL, varied coverage percentage instead of an always-true bypass', () => {
    // 36 Condiment rows, all active:false, recipeItem:false (no stray null row at all -- the
    // 17-store shape). Pre-fix this store's Condiment universe was 0 (vacuously covered no
    // matter what). Post-fix it's a real 36-item universe that a partial count genuinely fails.
    const rows = [
      ...mk('Y', 'Food', 118, '2026-08-06'),
      ...mk('Y', 'Condiment', 36, null).map(r => ({ ...r, active: false, recipeItem: false })),
    ];
    let done = 0;
    for (const r of rows) {
      if (r.cls === 'Condiment' && done < 20) { r.last_counted = '2026-08-06'; done++; } // 20/36 = 55.6%
    }
    const { sessions, classTotals } = detectSessions(rows);
    expect(classTotals['Y'].Condiment).toBe(36); // not 0 -- no more vacuous bypass
    const s = sessions['Y'][0];
    expect(s.covered).not.toContain('Condiment'); // 55.6% < COVER_FRAC -- a real, failing check
    expect(s.satisfiesWeekly).toBe(false);
  });

  it('does NOT touch Food/Paper/Non-Product -- an inactive, non-Topic-6 item in those classes ' +
     'is still excluded from the universe exactly as before', () => {
    const rows = [
      ...mk('Z', 'Food', 100, null).map(r => ({ ...r, active: true })),
      ...mk('Z', 'Food', 5, null, 100).map(r => ({ ...r, active: false, recipeItem: false })), // still excluded
      ...mk('Z', 'Paper', 50, null).map(r => ({ ...r, active: false, recipeItem: false })),    // still excluded
    ];
    const { classTotals } = detectSessions(rows);
    expect(classTotals['Z'].Food).toBe(100); // the 5 inactive Food items are NOT rescued
    expect(classTotals['Z'].Paper).toBeUndefined(); // Paper still hits the zero-universe path, unrelated to this fix
  });
});

// 2026-09-01 (owner req) -- "we have the days of week that each store counts" measured false as
// a stored setting; this derives it from history instead. Weekday-labeled real dates (computed,
// not guessed): 2026-08-06/13/20/27 and 2026-07-30 are Thursdays; 2026-08-04/11/18/25 are
// Tuesdays; 2026-08-08/15/22/29 are Saturdays.
//
// One period = one `store(loc, [oneSession])` call, kept as a SEPARATE rows-array and passed as
// its own element of `rowsByPeriod` -- never multiple full-coverage sessions folded into a single
// `store()` call. store()'s helper mutates ONE shared rows array in place per session, so a
// second full-coverage session there overwrites the first session's dates entirely (confirmed by
// running it: sampleSize came back 1, not N, the first time this was written) -- it correctly
// models "the rolling-latest-state view of a SINGLE qsr_onhand snapshot," which is exactly why
// detectWeeklyCountDay's own doc comment requires one independent rows-array per period instead.
describe('detectWeeklyCountDay', () => {
  const period = (loc, date, counts) => store(loc, [{ date, counts }]);

  it('a store with every weekly session on the same weekday reads full confidence', () => {
    const rowsByPeriod = [
      period('T1', '2026-08-06', { Food: 118, Condiment: 36 }),
      period('T1', '2026-08-13', { Food: 118, Condiment: 36 }),
      period('T1', '2026-08-20', { Food: 118, Condiment: 36 }),
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T1']).toMatchObject({ weekday: 4, weekdayName: 'Thu', sampleSize: 3, agreeCount: 3, confidence: 1 });
  });

  it('the majority weekday wins over a single outlier session', () => {
    const rowsByPeriod = [
      period('T2', '2026-08-06', { Food: 118, Condiment: 36 }),  // Thu
      period('T2', '2026-08-11', { Food: 118, Condiment: 36 }),  // Tue -- outlier
      period('T2', '2026-08-13', { Food: 118, Condiment: 36 }),  // Thu
      period('T2', '2026-08-20', { Food: 118, Condiment: 36 }),  // Thu
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T2'].weekday).toBe(4); // Thu
    expect(out['T2'].agreeCount).toBe(3);
    expect(out['T2'].sampleSize).toBe(4);
    expect(out['T2'].confidence).toBeCloseTo(0.75);
  });

  it('an exact tie breaks toward the MOST RECENT weekday, not the first seen', () => {
    const rowsByPeriod = [
      period('T3', '2026-08-06', { Food: 118, Condiment: 36 }),  // Thu
      period('T3', '2026-08-11', { Food: 118, Condiment: 36 }),  // Tue
      period('T3', '2026-08-13', { Food: 118, Condiment: 36 }),  // Thu
      period('T3', '2026-08-18', { Food: 118, Condiment: 36 }),  // Tue -- most recent overall
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T3'].weekday).toBe(2); // Tue, not Thu -- recency tiebreak, both tied at 2
    expect(out['T3'].agreeCount).toBe(2);
    expect(out['T3'].lastSeenDate).toBe('2026-08-18');
  });

  it('an EOM session (Food+Condiment+Paper, close window, large count) counts toward the same ' +
     'tally as a plain weekly session -- one "complete weekly count" definition, not two', () => {
    const rowsByPeriod = [
      period('T4', '2026-07-30', { Food: 118, Condiment: 36, Paper: 92 }),  // Thu, EOM
      period('T4', '2026-08-06', { Food: 118, Condiment: 36 }),             // Thu, plain weekly
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T4'].weekday).toBe(4);
    expect(out['T4'].agreeCount).toBe(2);
  });

  // 2026-09-01 CORRECTED — the first version of this test asserted null for a partial/spot
  // session (well under COVER_FRAC). That was testing the function's since-corrected first
  // implementation (satisfiesWeekly-basis) rather than the proven touchedWeeklyClasses basis it
  // now shares with eom-dashboard.js's cadenceFromOnHand() (dispatch #112, 27/27 live
  // population): a PARTIAL Food touch still counts toward day detection, on purpose -- day-of-
  // week PATTERN and weekly-completion STATUS are different questions. A 30-of-118 partial Food
  // count is exactly the kind of real signal (a store consistently attempting its count on one
  // day even when it rarely finishes) this basis is meant to surface.
  it('a partial/spot session (well under COVER_FRAC) still counts toward day detection -- the touchedWeeklyClasses basis, not the compliance bar', () => {
    const rowsByPeriod = [
      period('T5', '2026-08-06', { Food: 30 }),   // Thu -- partial, never clears COVER_FRAC
      period('T5', '2026-08-13', { Food: 22 }),   // Thu -- also partial
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T5']).toMatchObject({ weekday: 4, weekdayName: 'Thu', sampleSize: 2, agreeCount: 2, confidence: 1 });
  });

  // The genuine null case: a store that has never touched Food OR Condiment at all -- only
  // Paper, which floats mid-month and carries no weekly day-of-week signal of its own.
  it('a store that has only ever touched Paper (never Food or Condiment) returns null, not a guess', () => {
    const rowsByPeriod = [period('T5b', '2026-08-14', { Paper: 40 })];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T5b']).toBeNull();
  });

  // The real-world quirk this basis relies on (see this function's own doc comment and
  // count-cycle.js's file-header "KNOWN LIMITATION"): qsr_onhand upserts on (loc, period, wrin),
  // so a SINGLE period's snapshot can carry more than one distinct session date, because not
  // every item gets re-touched every week. Two genuinely different weekday attempts inside ONE
  // period must both be tallied, not just the most recent.
  it('a single period can carry more than one qualifying session date, and both are tallied', () => {
    const onePeriod = store('T5c', [
      { date: '2026-08-06', counts: { Food: 118, Condiment: 36 } },  // Thu -- full weekly count
      { date: '2026-08-11', counts: { Food: 20 } },                  // Tue -- partial re-touch of a subset
    ]);
    const out = detectWeeklyCountDay([onePeriod]);
    expect(out['T5c'].sampleSize).toBe(2);
    // Tied 1-1 (Thu vs Tue) -- recency tiebreak picks the more recent date, 08-11 (Tue).
    expect(out['T5c'].weekday).toBe(2);
    expect(out['T5c'].lastSeenDate).toBe('2026-08-11');
  });

  it('sampleWindow caps how far back it looks -- an old, now-stale weekday drops out of the tally', () => {
    const rowsByPeriod = [
      period('T6', '2026-08-04', { Food: 118, Condiment: 36 }),  // Tue -- older, will be trimmed
      period('T6', '2026-08-06', { Food: 118, Condiment: 36 }),  // Thu
      period('T6', '2026-08-13', { Food: 118, Condiment: 36 }),  // Thu
      period('T6', '2026-08-20', { Food: 118, Condiment: 36 }),  // Thu
    ];
    const out = detectWeeklyCountDay(rowsByPeriod, { sampleWindow: 3 });
    expect(out['T6'].sampleSize).toBe(3);
    expect(out['T6'].weekday).toBe(4); // Thu, unanimous once the Tue session is windowed out
    expect(out['T6'].confidence).toBe(1);
  });

  it('a store present in some periods but not others still aggregates correctly across the ones it appears in', () => {
    const rowsByPeriod = [
      period('T7', '2026-08-06', { Food: 118, Condiment: 36 }),   // Thu
      store('OTHER', [{ date: '2026-08-11', counts: { Food: 118, Condiment: 36 } }]), // a different store, same period slot
      period('T7', '2026-08-20', { Food: 118, Condiment: 36 }),   // Thu
    ];
    const out = detectWeeklyCountDay(rowsByPeriod);
    expect(out['T7'].sampleSize).toBe(2);
    expect(out['T7'].weekday).toBe(4);
    expect(out['OTHER'].sampleSize).toBe(1);
  });

  it('a loc with zero sessions of any kind never appears in the output map', () => {
    const out = detectWeeklyCountDay([]);
    expect(Object.keys(out)).toHaveLength(0);
  });
});

// 2026-09-01 (owner req) -- expand the share link to work with weekly counts. This is a pure
// function of ONE cycleCompliance() row, so a real fixture goes through the real engine first
// (not a hand-built compliance object) -- proves the formatter agrees with what cycleCompliance()
// actually computes, not just with a shape someone imagined it produces.
describe('formatWeeklyComplianceReport', () => {
  it('a clean store (on cycle, no exceptions) reports status + its session history', () => {
    const rows = store('W1', [{ date: '2026-08-06', counts: { Food: 118, Condiment: 36 } }]);
    const c = cycleCompliance(rows, { asOf: '2026-08-07' })[0];
    const md = formatWeeklyComplianceReport(c, { storeName: 'Ardmore-Broadway' });

    expect(md).toMatch(/# Count Cycle — Ardmore-Broadway/);
    expect(md).toMatch(/\*\*Status: On cycle\*\*/);
    expect(md).toMatch(/last full count 2026-08-06 \(1 day ago\)/);
    expect(md).toMatch(/No open exceptions/);
    expect(md).toMatch(/\| 2026-08-06 \| Weekly \|/);
    expect(md).not.toMatch(/## Exceptions/); // no exceptions section header when there are none
  });

  it('a flagged store lists its exceptions with severity wording matching the in-app card', () => {
    // Overdue: only a stale count on record, 12 days before asOf (> WEEKLY_DUE_DAYS).
    const rows = store('W2', [{ date: '2026-07-26', counts: { Food: 118, Condiment: 36 } }]);
    const c = cycleCompliance(rows, { asOf: '2026-08-07' })[0];
    const md = formatWeeklyComplianceReport(c, { storeName: 'Tishomingo' });

    expect(md).toMatch(/\*\*Status: Critical\*\*/);
    expect(md).toMatch(/## Exceptions/);
    expect(md).toMatch(/\*\*Critical:\*\* .*12 days since the last complete Food \+ Condiment count/);
  });

  it('a store with no complete count yet (only a low-coverage spot session) does not crash and says so plainly', () => {
    // A store with genuinely ZERO rows never appears in cycleCompliance()'s output at all (it
    // groups by loc from detectSessions(), which only registers a loc once it has a counted
    // date) -- so this exercises the case a real caller would actually hand the formatter: a
    // known store that has counted SOMETHING, just nothing that satisfies a real weekly count yet.
    const spotRows = store('W3', [{ date: '2026-08-06', counts: { Food: 5 } }]);
    const c = cycleCompliance(spotRows, { asOf: '2026-08-07' })[0];
    const md = formatWeeklyComplianceReport(c, { storeName: 'New Store' });
    expect(md).toMatch(/no complete weekly count on record/);
    expect(md).not.toMatch(/undefined|NaN/);
  });
});
