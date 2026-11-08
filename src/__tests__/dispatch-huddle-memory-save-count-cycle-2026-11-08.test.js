// Task #125/#128 (memory/plan-huddle-phase2-2026-11-08.md's "Memory"/"The Save", memory/plan-
// count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md Section A) — owner-approved starting
// point, 2026-11-08: "I like this! Lets start there and then expand to the others as we can."
//
// Three new pure functions in src/engine/count-cycle.js, exercised directly against hand-built
// `sessions` arrays (the same shape cycleCompliance()'s own `.sessions` field, or detectSessions()/
// sessionsFromLog() output, already carries) rather than re-deriving them through a full
// detectSessions() call — these are unit tests of the streak/save math itself, not a second copy
// of task #126's own detectSessions coverage.
import { describe, it, expect } from 'vitest';
import { classStreak, classSave, mostRecentNearMiss } from '../engine/count-cycle.js';

const s = (date, pct, n = 50) => ({ date, counts: { Paper: n }, coveragePct: { Paper: pct } });

describe('classStreak (task #125 "Memory")', () => {
  it('counts consecutive under-threshold attempts ending at the most recent', () => {
    const sessions = [s('2026-10-01', 95), s('2026-10-08', 80), s('2026-10-15', 70), s('2026-10-22', 60)];
    expect(classStreak(sessions, 'Paper')).toEqual({
      cls: 'Paper', threshold: 90, streak: 3, sampleSize: 4, latestDate: '2026-10-22', latestPct: 60,
    });
  });

  it('resets to 0 when the most recent attempt already cleared the bar', () => {
    const sessions = [s('2026-10-01', 70), s('2026-10-08', 60), s('2026-10-15', 95)];
    expect(classStreak(sessions, 'Paper').streak).toBe(0);
  });

  it('is null when the class has no attempt history at all', () => {
    expect(classStreak([], 'Paper')).toBeNull();
  });

  it('ignores a session that never touched the class, even though coveragePct still reports a '+
     'number for it (a pure weekly Food+Condiment count must not read as "0% Paper, streak '+
     'continues" just because Paper has an active universe)', () => {
    const sessions = [{ date: '2026-10-01', counts: { Food: 50 }, coveragePct: { Food: 100, Paper: 0 } }];
    expect(classStreak(sessions, 'Paper')).toBeNull();
  });

  it('respects a custom threshold', () => {
    const sessions = [s('2026-10-01', 92), s('2026-10-08', 96)];
    expect(classStreak(sessions, 'Paper', { threshold: 98 }).streak).toBe(2);
  });
});

describe('classSave (task #125 "The Save")', () => {
  it('fires exactly on the session where a real streak just broke', () => {
    const sessions = [s('2026-10-01', 70), s('2026-10-08', 60), s('2026-10-15', 95)];
    expect(classSave(sessions, 'Paper')).toEqual({
      cls: 'Paper', threshold: 90, priorStreak: 2, recoveredDate: '2026-10-15', recoveredPct: 95,
    });
  });

  it('is null while the streak is still running (nothing to save yet)', () => {
    const sessions = [s('2026-10-01', 70), s('2026-10-08', 60)];
    expect(classSave(sessions, 'Paper')).toBeNull();
  });

  it('is null on a lone good session with no prior streak to break', () => {
    const sessions = [s('2026-10-01', 95), s('2026-10-08', 92)];
    expect(classSave(sessions, 'Paper')).toBeNull();
  });

  it('respects minStreak -- a single bad week before a good one is not a save by default '+
     '(avoids reading one noisy week as a "pattern")', () => {
    const sessions = [s('2026-10-01', 70), s('2026-10-08', 95)];
    expect(classSave(sessions, 'Paper')).toBeNull();
    expect(classSave(sessions, 'Paper', { minStreak: 1 })).toEqual({
      cls: 'Paper', threshold: 90, priorStreak: 1, recoveredDate: '2026-10-08', recoveredPct: 95,
    });
  });

  it('only fires on the LATEST session -- a save from two periods ago does not keep re-firing '+
     'once a newer session exists', () => {
    const sessions = [s('2026-10-01', 70), s('2026-10-08', 60), s('2026-10-15', 95), s('2026-10-22', 97)];
    expect(classSave(sessions, 'Paper')).toBeNull(); // the save already happened on 10-15, not 10-22
  });
});

describe('mostRecentNearMiss (task #126/#125 — GM Coaching Letters)', () => {
  it('finds the latest attempt that missed full compliance, with its real percentages and '+
     'missing items intact', () => {
    const sessions = [
      { date: '2026-09-30', attemptsEom: true, isEom: true, satisfiesWeekly: false, satisfiesMidPaper: false, coveragePct: { Paper: 100 } },
      { date: '2026-10-30', attemptsEom: true, isEom: false, satisfiesWeekly: false, satisfiesMidPaper: false,
        coveragePct: { Food: 98, Condiment: 97, Paper: 88 },
        missingItems: { Paper: [{ wrin: 'P-1', descr: 'Pour Spouts' }] } },
    ];
    const nm = mostRecentNearMiss(sessions);
    expect(nm.date).toBe('2026-10-30');
    expect(nm.coveragePct).toEqual({ Food: 98, Condiment: 97, Paper: 88 });
    expect(nm.missingItems.Paper[0].descr).toBe('Pour Spouts');
  });

  it('is null when the most recent attempt was fully compliant', () => {
    const sessions = [{ date: '2026-10-30', attemptsEom: true, isEom: true, satisfiesWeekly: false, satisfiesMidPaper: false }];
    expect(mostRecentNearMiss(sessions)).toBeNull();
  });

  it('is null when the session never attempted any real cycle at all (a spot check)', () => {
    const sessions = [{ date: '2026-10-30', attemptsEom: false, attemptsWeekly: false, attemptsMidPaper: false,
      isEom: false, satisfiesWeekly: false, satisfiesMidPaper: false }];
    expect(mostRecentNearMiss(sessions)).toBeNull();
  });

  it('is null on an empty session list', () => {
    expect(mostRecentNearMiss([])).toBeNull();
  });
});
