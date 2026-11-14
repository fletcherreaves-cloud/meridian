// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  evaluateActionFlag, flattenSquadleRecord, flattenSquadleRecords,
  computeSquadleStoreDayRollup, computeSquadleSummary, extractFlaggedItems,
} from '../engine/squadle-checklist.js';

function action(overrides) {
  return { type: 'toggle', label: 'Test action', using: 'manual', value: 'Yes', ...overrides };
}
function task(overrides) {
  return { kind: 'regular', name: 'Test task', actions: {}, ...overrides };
}
function shift(overrides) {
  return { name: 'Start-Up', startTime: '05:00', endTime: '07:00', tasks: {}, ...overrides };
}
function row(overrides) {
  return { loc: '0003708', dt: '2026-11-14', shard: 'sqdl-prod-cd-001', data: { shifts: {} }, ...overrides };
}

describe('evaluateActionFlag', () => {
  it('returns null/null when the action has no value yet', () => {
    expect(evaluateActionFlag(action({ value: '' }))).toEqual({ flagged: null, reason: null });
    expect(evaluateActionFlag(null)).toEqual({ flagged: null, reason: null });
  });

  it('flags a number out of its range trigger', () => {
    const a = action({
      type: 'number', value: 29,
      triggers: { 0: { type: 'range', lowerRange: '30', upperRange: '34' } },
    });
    const r = evaluateActionFlag(a);
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/29/);
  });

  it('does not flag a number inside its range trigger', () => {
    const a = action({
      type: 'number', value: 32,
      triggers: { 0: { type: 'range', lowerRange: '30', upperRange: '34' } },
    });
    expect(evaluateActionFlag(a)).toEqual({ flagged: false, reason: null });
  });

  it('flags a toggle that matches its bad matchValue', () => {
    const a = action({
      type: 'toggle', value: 'No',
      triggers: { 0: { type: 'match', matchValue: 'No' } },
    });
    const r = evaluateActionFlag(a);
    expect(r.flagged).toBe(true);
  });

  it('does not flag a toggle that does not match its bad matchValue', () => {
    const a = action({
      type: 'toggle', value: 'Yes',
      triggers: { 0: { type: 'match', matchValue: 'No' } },
    });
    expect(evaluateActionFlag(a)).toEqual({ flagged: false, reason: null });
  });

  it('returns flagged:null for an unevaluable formula trigger (real trigger type, not guessed)', () => {
    const a = action({
      type: 'formula', value: 'Yes',
      triggers: { 0: { type: 'formula', formula: 'stringcompare(#0,Shut Down)' } },
    });
    expect(evaluateActionFlag(a)).toEqual({ flagged: null, reason: null });
  });

  it('has no triggers at all -> flagged:null, not false (nothing to evaluate)', () => {
    expect(evaluateActionFlag(action({ value: 'Yes' }))).toEqual({ flagged: null, reason: null });
  });
});

describe('flattenSquadleRecord', () => {
  it('drops readOnly actions entirely (not completable)', () => {
    const r = row({
      data: { shifts: { 0: shift({ tasks: { 0: task({ actions: {
        0: action({ type: 'readOnly', label: 'Instructional text only' }),
        1: action({ type: 'toggle', value: 'Yes' }),
      } }) } }) } },
    });
    const flat = flattenSquadleRecord(r);
    expect(flat).toHaveLength(1);
    expect(flat[0].actionType).toBe('toggle');
  });

  it('carries loc/dt/shard and the real optional flag through to each flattened row', () => {
    const r = row({
      data: { shifts: { 0: shift({ name: 'Breakfast Menu Products', tasks: { 0: task({ name: 'Sausage Temp', actions: {
        0: action({ type: 'number', value: 32, optional: false }),
        1: action({ type: 'photo', value: '', optional: true }),
      } }) } }) } },
    });
    const flat = flattenSquadleRecord(r);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ loc: '0003708', dt: '2026-11-14', shiftName: 'Breakfast Menu Products', taskName: 'Sausage Temp', optional: false, hasValue: true });
    expect(flat[1]).toMatchObject({ optional: true, hasValue: false });
  });

  it('returns [] for a malformed row instead of throwing', () => {
    expect(flattenSquadleRecord({})).toEqual([]);
    expect(flattenSquadleRecord(null)).toEqual([]);
    expect(flattenSquadleRecord({ data: {} })).toEqual([]);
  });

  it('flattenSquadleRecords flattens a batch', () => {
    const r1 = row({ data: { shifts: { 0: shift({ tasks: { 0: task({ actions: { 0: action() } }) } }) } } });
    const r2 = row({ loc: '0006972', data: { shifts: { 0: shift({ tasks: { 0: task({ actions: { 0: action(), 1: action() } }) } }) } } });
    expect(flattenSquadleRecords([r1, r2])).toHaveLength(3);
  });
});

describe('computeSquadleStoreDayRollup', () => {
  it('computes completionRate from REQUIRED actions only, tracking optional separately', () => {
    const flat = [
      { loc: '0003708', dt: '2026-11-14', optional: false, hasValue: true, flagged: false },
      { loc: '0003708', dt: '2026-11-14', optional: false, hasValue: false, flagged: null },
      { loc: '0003708', dt: '2026-11-14', optional: true, hasValue: false, flagged: null },
    ];
    const [g] = computeSquadleStoreDayRollup(flat);
    expect(g.requiredCount).toBe(2);
    expect(g.requiredCompletedCount).toBe(1);
    expect(g.completionRate).toBe(0.5);
    expect(g.optionalCount).toBe(1);
    expect(g.optionalCompletedCount).toBe(0);
  });

  it('counts a flagged optional action toward flaggedCount even though it does not affect completionRate', () => {
    const flat = [
      { loc: '0003708', dt: '2026-11-14', optional: true, hasValue: true, flagged: true, shiftName: 'S', taskName: 'T', label: 'L', value: 'No', flagReason: 'r', lastEdited: '2026-11-14T10:00:00Z' },
    ];
    const [g] = computeSquadleStoreDayRollup(flat);
    expect(g.flaggedCount).toBe(1);
    expect(g.flaggedItems).toHaveLength(1);
    expect(g.requiredCount).toBe(0); // optional, so not in the required denominator at all
  });

  it('returns completionRate:null for a store-day with zero required actions', () => {
    const flat = [{ loc: '0003708', dt: '2026-11-14', optional: true, hasValue: true, flagged: false }];
    const [g] = computeSquadleStoreDayRollup(flat);
    expect(g.completionRate).toBeNull();
  });

  it('groups separately by (loc, dt)', () => {
    const flat = [
      { loc: '0003708', dt: '2026-11-14', optional: false, hasValue: true, flagged: false },
      { loc: '0003708', dt: '2026-11-13', optional: false, hasValue: true, flagged: false },
      { loc: '0006972', dt: '2026-11-14', optional: false, hasValue: true, flagged: false },
    ];
    expect(computeSquadleStoreDayRollup(flat)).toHaveLength(3);
  });
});

describe('computeSquadleSummary', () => {
  it('aggregates Σcompleted/Σrequired across stores — never a mean of store rates', () => {
    // Store A: 1/1 required (100%); Store B: 1/99 required (~1%). A naive mean would read ~50%.
    const rollup = [
      { loc: 'A', dt: '2026-11-14', requiredCount: 1, requiredCompletedCount: 1, flaggedCount: 0 },
      { loc: 'B', dt: '2026-11-14', requiredCount: 99, requiredCompletedCount: 1, flaggedCount: 0 },
    ];
    const summary = computeSquadleSummary(rollup);
    expect(summary.requiredCount).toBe(100);
    expect(summary.requiredCompletedCount).toBe(2);
    expect(summary.completionRate).toBeCloseTo(0.02, 5);
  });

  it('sorts perStore worst-completion-first', () => {
    const rollup = [
      { loc: 'A', dt: '2026-11-14', requiredCount: 10, requiredCompletedCount: 10, flaggedCount: 0 },
      { loc: 'B', dt: '2026-11-14', requiredCount: 10, requiredCompletedCount: 2, flaggedCount: 0 },
    ];
    const summary = computeSquadleSummary(rollup);
    expect(summary.perStore[0].loc).toBe('B');
    expect(summary.perStore[1].loc).toBe('A');
  });

  it('sums flaggedCount across stores and days', () => {
    const rollup = [
      { loc: 'A', dt: '2026-11-14', requiredCount: 1, requiredCompletedCount: 1, flaggedCount: 2 },
      { loc: 'A', dt: '2026-11-13', requiredCount: 1, requiredCompletedCount: 1, flaggedCount: 1 },
    ];
    const summary = computeSquadleSummary(rollup);
    expect(summary.flaggedCount).toBe(3);
    expect(summary.perStore[0].days).toBe(2);
  });
});

describe('extractFlaggedItems', () => {
  it('filters to only flagged:true rows, newest lastEdited first', () => {
    const flat = [
      { flagged: false, lastEdited: '2026-11-14T10:00:00Z' },
      { flagged: true, lastEdited: '2026-11-13T09:00:00Z' },
      { flagged: true, lastEdited: '2026-11-14T08:00:00Z' },
      { flagged: null, lastEdited: '2026-11-14T11:00:00Z' },
    ];
    const items = extractFlaggedItems(flat);
    expect(items).toHaveLength(2);
    expect(items[0].lastEdited).toBe('2026-11-14T08:00:00Z');
    expect(items[1].lastEdited).toBe('2026-11-13T09:00:00Z');
  });

  it('a flagged item with no lastEdited sorts last, not crashing', () => {
    const flat = [
      { flagged: true, lastEdited: null },
      { flagged: true, lastEdited: '2026-11-14T08:00:00Z' },
    ];
    const items = extractFlaggedItems(flat);
    expect(items[0].lastEdited).toBe('2026-11-14T08:00:00Z');
    expect(items[1].lastEdited).toBeNull();
  });
});
