// @ts-nocheck
// Backlog item / notes-33-queue.md's "AI recommendations on the 3 judgment calls" A:
// "keep majority-of-month as the headline single score... BUT now that transfer dates exist,
// also compute a day-weighted split across stores... so the attribution is auditable and
// transparent... Flag any review where no single store holds ≥~70% of the person's days for
// manual attention/override." resolvePeriodAttribution() (the majority-of-month headline
// picker every OTHER score in the app uses via autoPopulateKPIs/review.loc) already existed;
// periodAttributionSplit is the additive half -- the full per-store day breakdown plus the
// flag, neither of which existed before this.
import { describe, it, expect } from 'vitest';
import { periodAttributionSplit, LOCATION_ATTRIBUTION_MAJORITY_THRESHOLD } from '../engine/review-engine.js';

describe('periodAttributionSplit (location-attribution tightening)', () => {
  it('a single segment spanning the whole period gets 100% and needs no attention', () => {
    const segs = [{ loc: '100', role: 'GM', start: '2026-01-01', end: '2026-12-31' }];
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', segs);
    expect(r.splits).toHaveLength(1);
    expect(r.splits[0]).toMatchObject({ loc: '100', pct: 1 });
    expect(r.needsAttention).toBe(false);
  });

  it('a genuinely close split (~50/50) flags needsAttention', () => {
    const segs = [
      { loc: '100', role: 'AM', start: '2026-01-01', end: '2026-06-30' },
      { loc: '200', role: 'GM', start: '2026-07-01', end: '2026-12-31' },
    ];
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', segs);
    expect(r.splits).toHaveLength(2);
    expect(r.splits[0].pct).toBeLessThan(LOCATION_ATTRIBUTION_MAJORITY_THRESHOLD);
    expect(r.needsAttention).toBe(true);
  });

  it('a clear majority (>=70%) does NOT flag needsAttention, even with a second store present', () => {
    const segs = [
      { loc: '100', role: 'GM', start: '2026-01-01', end: '2026-11-30' },
      { loc: '200', role: 'GM', start: '2026-12-01', end: '2026-12-31' },
    ];
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', segs);
    expect(r.splits[0].loc).toBe('100');
    expect(r.splits[0].pct).toBeGreaterThanOrEqual(LOCATION_ATTRIBUTION_MAJORITY_THRESHOLD);
    expect(r.needsAttention).toBe(false);
  });

  it('exactly at the 70% threshold does NOT flag (>= is the majority, not > )', () => {
    // 70 days of a 100-day period, exactly.
    const segs = [
      { loc: '100', start: '2026-01-01', end: '2026-03-11' }, // 70 days inclusive
      { loc: '200', start: '2026-03-12', end: '2026-04-10' }, // remaining 30 days
    ];
    const r = periodAttributionSplit('2026-01-01', '2026-04-10', segs);
    expect(r.totalDays).toBe(100);
    expect(r.splits[0]).toMatchObject({ loc: '100', days: 70, pct: 0.7 });
    expect(r.needsAttention).toBe(false);
  });

  it('groups by STORE, not by segment -- two segments at the same store (a role change with no relocation) combine', () => {
    const segs = [
      { loc: '100', role: 'AM', start: '2026-01-01', end: '2026-06-30' },
      { loc: '100', role: 'GM', start: '2026-07-01', end: '2026-12-31' }, // promoted, same store
    ];
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', segs);
    expect(r.splits).toHaveLength(1); // one store, not two rows
    expect(r.splits[0]).toMatchObject({ loc: '100', pct: 1 });
    expect(r.splits[0].roles).toEqual(expect.arrayContaining(['AM', 'GM']));
    expect(r.needsAttention).toBe(false);
  });

  it('a segment only partially overlapping the requested period is clipped to the overlap, not counted in full', () => {
    // Segment runs the whole year, but we're only asking about H1.
    const segs = [{ loc: '100', start: '2026-01-01', end: '2026-12-31' }];
    const r = periodAttributionSplit('2026-01-01', '2026-06-30', segs);
    expect(r.totalDays).toBe(181); // H1 2026 (non-leap)
    expect(r.splits[0].days).toBe(181);
  });

  it('no segments at all -> empty splits, needsAttention false (nothing to flag)', () => {
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', []);
    expect(r.splits).toEqual([]);
    expect(r.needsAttention).toBe(false);
  });

  it('sorted by days descending, ties broken by loc string', () => {
    const segs = [
      { loc: '300', start: '2026-01-01', end: '2026-04-30' }, // 120 days
      { loc: '100', start: '2026-05-01', end: '2026-08-28' }, // 120 days
      { loc: '200', start: '2026-08-29', end: '2026-12-31' }, // 125 days -- biggest
    ];
    const r = periodAttributionSplit('2026-01-01', '2026-12-31', segs);
    expect(r.splits.map(s => s.loc)).toEqual(['200', '100', '300']); // 200 biggest, then tie-break alpha
  });
});
