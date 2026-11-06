// @vitest-environment happy-dom
// @ts-nocheck
// Owner-caught LIVE on District View, 2026-11-06: "undefined is not an object (evaluating
// 't.dkEnd.localeCompare')" -- the real production error boundary, screenshot attached.
//
// Root cause: groupEventRanges() (engine/events-import.js) only sets dkEnd on a COLLAPSED
// multi-day group -- a hand-entered single-day event (no rangeId) passes straight through
// unchanged, with no dkEnd field at all. store-analytics.js's "RECENT EVENTS" strip (#1679,
// 2026-11-05) sorted that output by `(a,b)=>b.dkEnd.localeCompare(a.dkEnd)` with no fallback,
// which crashes the instant Array.prototype.sort actually has to compare two items and at
// least one lacks dkEnd -- i.e. any store with 2+ real single-day events, which is the common
// case, not an edge case. (A single-item array never triggers the crash: sort() never calls
// its comparator with fewer than 2 elements -- this is NOT a safe way to "test" the old code.)
//
// Extracted sortRecentEvents() (store-analytics.js) so this is directly testable without a
// StoreAnalytics mount harness (this file has none -- heavy prop surface, per #1679's own PR
// body), per CLAUDE.md's "would this verification still pass if the change were reverted?"
// rule: reverting the `|| b.dk` / `|| a.dk` fallback must fail this test, not just look fixed.
import { describe, it, expect } from 'vitest';
import { groupEventRanges } from '../engine/events-import.js';
import { sortRecentEvents } from '../views/store-analytics.js';

describe('sortRecentEvents (dispatch, 2026-11-06 live crash)', () => {
  it('does not throw on two single-day events with no dkEnd -- the exact live crash', () => {
    const evMap = {
      '2026-11-01': { label: 'Event A', type: 'promo' },
      '2026-11-02': { label: 'Event B', type: 'promo' },
    };
    const grouped = groupEventRanges(Object.entries(evMap).map(([dk, ev]) => ({ dk, ...ev })));
    expect(grouped.every(e => e.dkEnd === undefined)).toBe(true); // confirms the real shape that crashed
    expect(() => sortRecentEvents(grouped)).not.toThrow();
  });

  it('sorts single-day events most-recent-first, by dk since dkEnd is absent', () => {
    const grouped = [
      { dk: '2026-11-01', label: 'Older' },
      { dk: '2026-11-03', label: 'Newest' },
      { dk: '2026-11-02', label: 'Middle' },
    ];
    expect(sortRecentEvents(grouped).map(e => e.label)).toEqual(['Newest', 'Middle', 'Older']);
  });

  it('sorts a mix of collapsed ranged groups (real dkEnd) and single-day events (no dkEnd) correctly', () => {
    const evMap = {
      '2026-11-01': { label: 'Single-day event (earliest dk, but no range)', type: 'promo' },
      '2026-11-02': { label: 'Ranged promo', type: 'promo', rangeId: 'r1', rangeDayNum: 1, rangeTotalDays: 3 },
      '2026-11-03': { label: 'Ranged promo', type: 'promo', rangeId: 'r1', rangeDayNum: 2, rangeTotalDays: 3 },
      '2026-11-04': { label: 'Ranged promo', type: 'promo', rangeId: 'r1', rangeDayNum: 3, rangeTotalDays: 3 },
    };
    const grouped = groupEventRanges(Object.entries(evMap).map(([dk, ev]) => ({ dk, ...ev })));
    const sorted = sortRecentEvents(grouped);
    // The ranged group's real dkEnd (11-04) outranks the single-day event's dk (11-01).
    expect(sorted[0].label).toBe('Ranged promo');
    expect(sorted[0].dkEnd).toBe('2026-11-04');
    expect(sorted[1].label).toBe('Single-day event (earliest dk, but no range)');
  });

  it('does not mutate the input array (returns a new sorted array)', () => {
    const grouped = [{ dk: '2026-11-02' }, { dk: '2026-11-01' }];
    const original = [...grouped];
    sortRecentEvents(grouped);
    expect(grouped).toEqual(original);
  });
});
