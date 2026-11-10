// @ts-nocheck
// src/engine/security-persistence.js — persistence/chronic-streak scoring (dispatch 2026-11-10
// follow-on, extending Phase 1's security-health.js per the owner's "Security Health Dashboard"
// deep-dive §3 `persistence_multiplier` term). Mirrors security-drift.test.js's fixture style --
// a synthetic-but-dimensionally-real z-score history, magnitude fixed so hand-computed
// expectations are exact.
import { describe, it, expect } from 'vitest';
import {
  classifySubjectPersistence, contributionFromPersistence, persistenceContribution,
  computePersistenceRollup, PERSISTENCE_MIN_WINDOWS, PERSISTENCE_WEIGHT_PER_WINDOW, PERSISTENCE_BONUS_CAP,
} from '../engine/security-persistence.js';

// mean=0, stdev=10 fixed -> magnitude = value/stdev = 2 exactly, every window. Flagged on every
// window (pass:true) -- a clean, unbroken streak.
function chronicHistory(windows, { latestPass = true } = {}) {
  const out = [];
  for (let i = 0; i < windows; i++) {
    out.push({ value: 20, thresholdUsed: 10, pass: i === windows - 1 ? latestPass : true, baselineContext: { mean: 0, stdev: 10, n: 10 } });
  }
  return out;
}

describe('classifySubjectPersistence() — consecutive flagged windows ending at the latest, never guessed', () => {
  it('empty or all-hygiene history: 0 windows, not flagged', () => {
    expect(classifySubjectPersistence([]).consecutiveFlaggedWindows).toBe(0);
    expect(classifySubjectPersistence([{ pass: true, lifecycleCategory: 'obsolete' }]).consecutiveFlaggedWindows).toBe(0);
  });

  it('latest window not flagged -> 0, regardless of a chronic past (persistence is about a CURRENT problem)', () => {
    const history = chronicHistory(4, { latestPass: false });
    const result = classifySubjectPersistence(history);
    expect(result.consecutiveFlaggedWindows).toBe(0);
    expect(result.latestFlagged).toBe(false);
  });

  it('a clean 4-window flagged streak counts all 4, with the latest window\'s own magnitude', () => {
    const result = classifySubjectPersistence(chronicHistory(4));
    expect(result.consecutiveFlaggedWindows).toBe(4);
    expect(result.latestFlagged).toBe(true);
    expect(result.latestMagnitude).toBe(2); // value 20 / stdev 10
  });

  it('a break in the streak stops the count at the break, not the whole history length', () => {
    const history = [
      { value: 20, thresholdUsed: 10, pass: true, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 20, thresholdUsed: 10, pass: false, baselineContext: { mean: 0, stdev: 10, n: 10 } }, // breaks it
      { value: 20, thresholdUsed: 10, pass: true, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 20, thresholdUsed: 10, pass: true, baselineContext: { mean: 0, stdev: 10, n: 10 } },
    ];
    expect(classifySubjectPersistence(history).consecutiveFlaggedWindows).toBe(2);
  });

  it('a lifecycle-hygiene window is skipped entirely, not counted as a break', () => {
    const history = [
      { value: 20, thresholdUsed: 10, pass: true, baselineContext: { mean: 0, stdev: 10, n: 10 } },
      { value: 20, thresholdUsed: 10, pass: true, lifecycleCategory: 'obsolete', baselineContext: {} },
      { value: 20, thresholdUsed: 10, pass: true, baselineContext: { mean: 0, stdev: 10, n: 10 } },
    ];
    expect(classifySubjectPersistence(history).consecutiveFlaggedWindows).toBe(2); // the hygiene row drops out, not a break
  });
});

describe('contributionFromPersistence() — severity × magnitude × weight × windows beyond the floor, same shape as drift\'s own formula', () => {
  const RULE = { ruleId: 'CASH-002', severity: 3 };
  it('at or below PERSISTENCE_MIN_WINDOWS earns no bonus -- not yet "persistent" in a way worth extra weight', () => {
    expect(contributionFromPersistence(classifySubjectPersistence(chronicHistory(PERSISTENCE_MIN_WINDOWS)), RULE)).toBe(0);
    expect(contributionFromPersistence(classifySubjectPersistence(chronicHistory(PERSISTENCE_MIN_WINDOWS - 1)), RULE)).toBe(0);
  });

  it('matches severity × magnitude × PERSISTENCE_WEIGHT_PER_WINDOW × (windows - floor) below the cap', () => {
    const windows = PERSISTENCE_MIN_WINDOWS + 2;
    const persistence = classifySubjectPersistence(chronicHistory(windows));
    const expected = RULE.severity * 2 * PERSISTENCE_WEIGHT_PER_WINDOW * 2; // magnitude 2, extra=2
    expect(contributionFromPersistence(persistence, RULE)).toBeCloseTo(expected, 6);
  });

  it('never exceeds PERSISTENCE_BONUS_CAP, however long the streak', () => {
    const persistence = classifySubjectPersistence(chronicHistory(40));
    expect(contributionFromPersistence(persistence, RULE)).toBe(PERSISTENCE_BONUS_CAP);
  });

  it('persistenceContribution(history, rule) classifies and scores in one call, matching the two-step path', () => {
    const history = chronicHistory(PERSISTENCE_MIN_WINDOWS + 1);
    expect(persistenceContribution(history, RULE)).toBe(contributionFromPersistence(classifySubjectPersistence(history), RULE));
  });
});

describe('computePersistenceRollup() — per-store sum, same historyByKey shape computeDriftRollup consumes', () => {
  it('sums contributions per loc across multiple chronic keys, skips a non-contributing one entirely', () => {
    const rulesById = { 'CASH-002': { severity: 3 }, 'INV-001': { severity: 2 } };
    const historyByKey = new Map([
      ['k1', { loc: '0001111', ruleId: 'CASH-002', history: chronicHistory(PERSISTENCE_MIN_WINDOWS + 2) }],
      ['k2', { loc: '0001111', ruleId: 'INV-001', history: chronicHistory(PERSISTENCE_MIN_WINDOWS + 1) }],
      ['k3', { loc: '0002222', ruleId: 'CASH-002', history: chronicHistory(PERSISTENCE_MIN_WINDOWS) }], // at the floor -> 0, excluded
    ]);
    const byLoc = computePersistenceRollup(historyByKey, rulesById);
    expect(byLoc.has('0002222')).toBe(false); // zero-contribution loc never appears at all
    const row = byLoc.get('0001111');
    expect(row.chronicCount).toBe(2);
    expect(row.contribution).toBeGreaterThan(0);
  });

  it('a rule missing from the registry is skipped defensively, never crashes', () => {
    const historyByKey = new Map([['k1', { loc: '0001111', ruleId: 'GHOST-999', history: chronicHistory(10) }]]);
    expect(() => computePersistenceRollup(historyByKey, {})).not.toThrow();
    expect(computePersistenceRollup(historyByKey, {}).size).toBe(0);
  });
});
