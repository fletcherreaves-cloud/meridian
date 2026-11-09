// Task #126 (memory/plan-count-cycle-classification-2026-11-08.md, on branch
// claude/count-cycle-classification-scoping-2026-11-08 at the time this test was written) —
// splitting count-cycle IDENTIFICATION (Axis 1: Cycle Attempt) from COMPLIANCE (Axis 2,
// COVER_FRAC=1, entirely unchanged) in src/engine/count-cycle.js.
//
// The real motivating case: Holdenville, 2026-10-30, inside the EOM close window — a
// substantial 233-item count (Food 118/120, Condiment 31/32, Paper 84/96) where every single
// class missed the strict 100% bar by a hair. Before this change, that reads IDENTICALLY to
// a 3-item spot check: isEom requires has('Paper') (the 100% bar), so covered=[], isEom=false,
// and the session's kind is the generic 'Partial' bucket. This test proves (a) it is now
// IDENTIFIED as an EOM attempt with the real per-class coverage shown, and (b) it is STILL
// graded non-compliant — the 100% bar is untouched, and the overdue/incomplete alerting a GM
// would see is unaffected. Verified by hand (see this file's own commit body) that this test
// FAILS against the pre-#126 code: s.kind reads 'Partial', not the two-part label, and
// s.attemptsEom/s.coveragePct are both undefined.
import { describe, it, expect } from 'vitest';
import { detectSessions, cycleCompliance, TOUCHED_FLOOR, COVER_FRAC } from '../engine/count-cycle.js';

const mk = (loc, cls, n, date, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${from + i}`, last_counted: date }));

// Holdenville's real 2026-10-30 numbers: Food 118/120 (98.33%), Condiment 31/32 (96.875%),
// Paper 84/96 (87.5%). Universe = counted + uncounted (last_counted: null) per class, so
// classTotals lands on exactly 120/32/96 the same way detectSessions() derives it from real
// qsr_onhand rows -- active, untouched items included in the denominator same as production.
function holdenvilleRows() {
  return [
    ...mk('13201', 'Food', 118, '2026-10-30'), ...mk('13201', 'Food', 2, null, 118),
    ...mk('13201', 'Condiment', 31, '2026-10-30'), ...mk('13201', 'Condiment', 1, null, 31),
    ...mk('13201', 'Paper', 84, '2026-10-30'), ...mk('13201', 'Paper', 12, null, 84),
  ];
}

describe('task #126 — Cycle Attempt identification survives a compliance miss (Holdenville 2026-10-30)', () => {
  it('(a) identifies the session as an EOM attempt, not generic Partial', () => {
    const { sessions } = detectSessions(holdenvilleRows());
    const s = sessions['13201'][0];
    expect(s.attemptsEom).toBe(true);
    // attemptsWeekly is ALSO true here -- it mirrors satisfiesWeekly's own lack of a window
    // gate (found during independent review: an earlier draft forced !eomWindow onto
    // attemptsWeekly too, which is wrong -- see the dedicated regression test below), and
    // this session genuinely touched Food+Condiment well past TOUCHED_FLOOR alongside Paper.
    // That's correct, not a conflict: the same "isEom && satisfiesWeekly both true" overlap
    // already exists on the compliant axis above. sessionLabel() still shows "End-of-Month"
    // (its own class list already includes Food/Condiment), so nothing is lost or ambiguous.
    expect(s.attemptsWeekly).toBe(true);
    expect(s.attemptsMidPaper).toBe(false);
    expect(s.kind).toBe('End-of-Month — Food 98%, Condiment 97%, Paper 88%');
  });

  it('(b) per-class coverage percentages are computed exactly, not round-guessed', () => {
    const { sessions } = detectSessions(holdenvilleRows());
    const s = sessions['13201'][0];
    // 118/120 = 98.333...% -> 98; 31/32 = 96.875% -> 97; 84/96 = 87.5% -> 88.
    expect(s.coveragePct).toEqual({ Food: 98, Condiment: 97, Paper: 88, 'Non-Product': null });
  });

  it('(c) is STILL graded non-compliant — the 100% COVER_FRAC bar is untouched by identification', () => {
    expect(COVER_FRAC).toBe(1);
    const { sessions } = detectSessions(holdenvilleRows());
    const s = sessions['13201'][0];
    // None of the three classes reached 100%, so the session is NOT in `covered`, and NONE
    // of the Axis-2 compliance flags flip to true just because Axis-1 now identifies it.
    // 'Non-Product' has zero rows in this fixture, so it's vacuously covered (same
    // 0-universe convention #357-B2/3's own comment documents, untouched by this change) —
    // Food/Condiment/Paper are the three real classes at stake and none of them clear 100%.
    expect(s.covered).toEqual(['Non-Product']);
    expect(s.isEom).toBe(false);
    expect(s.satisfiesWeekly).toBe(false);
    expect(s.satisfiesMidPaper).toBe(false);
  });

  // SUPERSEDED 2026-11-09 (owner-directed, the Seminole/Madill/Durant/etc. false-flag batch)
  // — this test used to assert the OPPOSITE of what it now asserts: that identifying this
  // session as a real attempt (Axis 1) must NOT quiet the overdue alert (Axis 2 stays the only
  // thing compliance reads). That was the deliberate scope boundary task #126 drew at the time
  // ("identification change never touches this logic"). The owner's own words superseding it:
  // "we need to be ok with dropping the 100% requirement, at least as it pertains to determining
  // a count status... acknowledge the count for what it is. An attempt to count... but a count
  // nonetheless that should be recognized." Holdenville's 118/120 Food, 31/32 Condiment, 84/96
  // Paper IS exactly that case — a real, substantial count a hair under 100% on every class —
  // and is now the textbook example of what should read as "verify what's left," not "no
  // complete count on record." complianceFromSessions()'s lastWeekly now also qualifies on
  // attemptsWeekly (Axis 1) + a real-volume floor, not satisfiesWeekly/isEom (Axis 2) alone;
  // COVER_FRAC/satisfiesWeekly is NOT removed — it still drives the coveragePct/missing-class
  // detail in the exception below, just no longer gates whether a real attempt is recognized.
  it('a near-miss EOM attempt is recognized as the count, with the shortfall surfaced as a ' +
     'verify-what\'s-left nudge instead of "no complete count"', () => {
    const c = cycleCompliance(holdenvilleRows(), { asOf: '2026-11-05' })[0];
    expect(c.lastWeekly).not.toBeNull();
    expect(c.lastWeekly.date).toBe('2026-10-30');
    expect(c.overdue).toBe(false);
    expect(c.status).toBe('warn');
    expect(c.exceptions.find(e => e.rule === 'weekly-overdue')).toBeFalsy();
    const incompleteEx = c.exceptions.find(e => e.rule === 'weekly-incomplete');
    expect(incompleteEx).toBeTruthy();
    expect(incompleteEx.detail).toContain('2026-10-30');
    // The verdict line still tells them exactly what to finish, just not "go count from zero."
    expect(c.verdict).toMatch(/Finish the .* count from 2026-10-30/);
  });

  it('TOUCHED_FLOOR reuses the existing isPartial/isSpot boundary (task #126 open Q2 default)', () => {
    expect(TOUCHED_FLOOR).toBe(25);
  });
});

// A full, real class universe for Food/Condiment/Paper (the three classes any of the
// has()/satisfiesX checks can read) — NOT just the classes a given test cares about —
// so an untouched class never falls into the "0 active items -> vacuously covered" rule
// (#357-B2/3's own documented convention) and silently flips an unrelated satisfiesWeekly/
// satisfiesMidPaper flag to true, which would short-circuit sessionLabel() before it ever
// reaches the new Axis-1 branch this test is actually exercising.
function fullUniverse(loc) {
  return [...mk(loc, 'Food', 118, null), ...mk(loc, 'Condiment', 36, null), ...mk(loc, 'Paper', 92, null)];
}
// Overwrite last_counted on the first N rows of a class to simulate this session's counts,
// same pattern count-cycle.test.js's own store() helper uses.
function withSession(rows, date, counts) {
  for (const [cls, n] of Object.entries(counts)) {
    let done = 0;
    for (const r of rows) { if (r.cls === cls && done < n) { r.last_counted = date; done++; } }
  }
  return rows;
}

describe('task #126 — attemptsWeekly / attemptsMidPaper, same shape as attemptsEom', () => {
  it('identifies a substantial-but-not-100%-compliant weekly count as a Weekly attempt', () => {
    // Outside the close window, Food 100/118 and Condiment 30/36 -- both well over
    // TOUCHED_FLOOR (25) but neither at 100%, so the OLD engine calls this 'Partial'.
    const rows = withSession(fullUniverse('A'), '2026-06-10', { Food: 100, Condiment: 30 });
    const { sessions } = detectSessions(rows);
    const s = sessions['A'][0];
    expect(s.attemptsWeekly).toBe(true);
    expect(s.attemptsEom).toBe(false);
    expect(s.attemptsMidPaper).toBe(false);   // Paper untouched this session
    expect(s.satisfiesWeekly).toBe(false);   // still non-compliant
    expect(s.kind).toMatch(/^Weekly — Food \d+%, Condiment \d+%$/);
  });

  it('identifies a substantial-but-not-100%-compliant mid-month Paper count as a Mid-Month-Paper attempt', () => {
    // Outside the close window, Paper 80/92 -- over TOUCHED_FLOOR, not 100%.
    const rows = withSession(fullUniverse('B'), '2026-06-10', { Paper: 80 });
    const { sessions } = detectSessions(rows);
    const s = sessions['B'][0];
    expect(s.attemptsMidPaper).toBe(true);
    expect(s.attemptsEom).toBe(false);
    expect(s.attemptsWeekly).toBe(false);   // Food/Condiment untouched this session
    expect(s.satisfiesMidPaper).toBe(false);   // still non-compliant
    expect(s.kind).toMatch(/^Mid-Month Paper — Paper \d+%$/);
  });

  it('a near-miss WEEKLY-shaped count INSIDE the close window is still identified as a Weekly '+
     'attempt, not dropped back to generic Partial (found + fixed during independent review: '+
     'attemptsWeekly must mirror satisfiesWeekly\'s own lack of a window gate, not borrow '+
     'attemptsMidPaper\'s !eomWindow restriction)', () => {
    // 2026-06-28 is inside June's close window (day 28 > 30-4=26). Food/Condiment well over
    // TOUCHED_FLOOR but not 100%; Paper untouched this session (not an EOM-shaped count at all).
    const rows = withSession(fullUniverse('D'), '2026-06-28', { Food: 100, Condiment: 30 });
    const { sessions } = detectSessions(rows);
    const s = sessions['D'][0];
    expect(s.attemptsWeekly).toBe(true);
    expect(s.attemptsEom).toBe(false);     // Paper never touched -- not an EOM attempt
    expect(s.satisfiesWeekly).toBe(false); // still non-compliant
    expect(s.kind).toMatch(/^Weekly — Food \d+%, Condiment \d+%$/);
  });

  it('a genuinely tiny touch is STILL identified and measured, not swept into generic Spot '+
     'check -- owner-directed 2026-11-08: "it really should be all inclusive... All items '+
     'must be accounted for", answering task #126 open Q2 (superseding TOUCHED_FLOOR as an '+
     'attempt-eligibility gate; it used to require n>=25 per class here)', () => {
    // Food 10/118, Condiment 5/36 -- real activity, well below the OLD 25-item floor for
    // both, but any real touch (n>=1) now earns a real percentage.
    const rows = withSession(fullUniverse('C'), '2026-06-10', { Food: 10, Condiment: 5 });
    const { sessions } = detectSessions(rows);
    const s = sessions['C'][0];
    expect(s.attemptsWeekly).toBe(true);
    expect(s.attemptsEom).toBe(false);
    expect(s.attemptsMidPaper).toBe(false);
    expect(s.kind).toMatch(/^Weekly — Food \d+%, Condiment \d+%$/);
    // isPartial/isSpot (the SEPARATE, untouched #357-B1 overdue-alert signal) still uses
    // TOUCHED_FLOOR for its own purpose -- n=15 here is still < 25, so isSpot stays true.
    // That classification is deliberately independent of the richer identification above.
    expect(s.isSpot).toBe(true);
  });

  it('a single-item touch (n=1) still gets a real, if tiny, percentage -- no floor at all', () => {
    const rows = withSession(fullUniverse('D2'), '2026-06-10', { Paper: 1 }); // outside close window
    const { sessions } = detectSessions(rows);
    const s = sessions['D2'][0];
    expect(s.attemptsMidPaper).toBe(true);
    expect(s.kind).toMatch(/^Mid-Month Paper — Paper 1%$/);
  });
});

describe('task #126 — sessionQualities() legacy 3-arg call stays byte-identical', () => {
  it('omitting `extra` returns exactly the original 5 keys, no attempt/coverage fields', async () => {
    const { sessionQualities } = await import('../engine/count-cycle.js');
    const q = sessionQualities('2026-06-10', ['Food', 'Condiment'], 10);
    expect(q).toEqual({ satisfiesWeekly: true, satisfiesMidPaper: false, isEom: false, isPartial: false, isSpot: false });
    expect(q.attemptsEom).toBeUndefined();
    expect(q.coveragePct).toBeUndefined();
  });
});
