// @ts-nocheck
// Dispatch #154 (Performance Review continuity, Phase 5a) — personAssignmentTimeline(), the new
// assignment-timeline reconstruction function this dispatch's scope item 1 requires. Distinct
// from every pre-existing assignment-graph.js function (dispatch #150), which resolves the graph
// AS OF ONE POINT IN TIME only — this one reconstructs ONE person's own role/store history across
// a date RANGE with possibly multiple transitions.
import { describe, it, expect } from 'vitest';
import { personAssignmentTimeline } from '../engine/assignment-graph.js';

const YEAR = ['2026-01-01', '2026-12-31'];

describe('personAssignmentTimeline — the common case (no assignment changes)', () => {
  it('a person with ONE row effective the whole period returns exactly ONE segment spanning the whole (clipped) period', () => {
    const rows = [
      { person: 'P3', role: 'gm', target_type: 'store', target: '100', start: '2020-01-01' },
    ];
    const segs = personAssignmentTimeline('P3', ...YEAR, rows);
    expect(segs).toEqual([{ role: 'gm', loc: '100', start: '2026-01-01', end: '2026-12-31' }]);
  });

  it('a person with NO staff_assignments rows at all returns [] (caller falls back to the review\'s own role/loc)', () => {
    expect(personAssignmentTimeline('Nobody', ...YEAR, [])).toEqual([]);
    expect(personAssignmentTimeline('Nobody', ...YEAR, [{ person: 'Someone Else', role: 'gm', target_type: 'store', target: '100', start: '' }])).toEqual([]);
  });
});

describe('personAssignmentTimeline — scenario A: store transfer, same role', () => {
  it('splits into two segments at the transfer date, same role, different store, clipped to the period', () => {
    const rows = [
      { person: 'P1', role: 'gm', target_type: 'store', target: '100', start: '2026-01-01' },
      { person: 'P1', role: 'gm', target_type: 'store', target: '200', start: '2026-07-01' },
    ];
    const segs = personAssignmentTimeline('P1', ...YEAR, rows);
    expect(segs).toEqual([
      { role: 'gm', loc: '100', start: '2026-01-01', end: '2026-06-30' },
      { role: 'gm', loc: '200', start: '2026-07-01', end: '2026-12-31' },
    ]);
  });
});

describe('personAssignmentTimeline — scenario B: role promotion, same store', () => {
  it('splits into two segments at the promotion date, same store, different ladder role', () => {
    const rows = [
      { person: 'P2', role: 'sm_am_dm', target_type: 'store', target: '100', start: '2026-01-01' },
      { person: 'P2', role: 'gm', target_type: 'store', target: '100', start: '2026-04-01' },
    ];
    const segs = personAssignmentTimeline('P2', ...YEAR, rows);
    expect(segs).toEqual([
      { role: 'sm_am_dm', loc: '100', start: '2026-01-01', end: '2026-03-31' },
      { role: 'gm', loc: '100', start: '2026-04-01', end: '2026-12-31' },
    ]);
  });
});

describe('personAssignmentTimeline — both at once (promotion AND transfer)', () => {
  it('handles a segment change that is both a role change and a store change simultaneously', () => {
    const rows = [
      { person: 'P4', role: 'sm_am_dm', target_type: 'store', target: '100', start: '2026-01-01' },
      { person: 'P4', role: 'gm', target_type: 'store', target: '500', start: '2026-09-01' },
    ];
    const segs = personAssignmentTimeline('P4', ...YEAR, rows);
    expect(segs).toEqual([
      { role: 'sm_am_dm', loc: '100', start: '2026-01-01', end: '2026-08-31' },
      { role: 'gm', loc: '500', start: '2026-09-01', end: '2026-12-31' },
    ]);
  });
});

describe('personAssignmentTimeline — malformed input (same-start tie)', () => {
  it('resolves a same-start tie by favoring the LATER row in input-array order (matches currentHolderOfTarget\'s own tie-break), not by crashing', () => {
    const rows = [
      { person: 'P5', role: 'sm_am_dm', target_type: 'store', target: '100', start: '2026-03-01' },
      { person: 'P5', role: 'gm', target_type: 'store', target: '200', start: '2026-03-01' }, // same start, appears LATER
    ];
    const segs = personAssignmentTimeline('P5', ...YEAR, rows);
    // The first (sm_am_dm/100) row collapses to a zero-width, dropped segment; only the later
    // (gm/200) row survives, spanning the whole clipped period from that shared start date.
    expect(segs).toEqual([{ role: 'gm', loc: '200', start: '2026-03-01', end: '2026-12-31' }]);
  });
});

describe('personAssignmentTimeline — clipping to the requested period', () => {
  it('clips a segment that starts before periodStart to periodStart', () => {
    const rows = [{ person: 'P6', role: 'gm', target_type: 'store', target: '100', start: '2020-06-15' }];
    expect(personAssignmentTimeline('P6', '2026-01-01', '2026-12-31', rows))
      .toEqual([{ role: 'gm', loc: '100', start: '2026-01-01', end: '2026-12-31' }]);
  });
  it('a transition after periodEnd never appears — only the row(s) effective within the period do', () => {
    const rows = [
      { person: 'P7', role: 'gm', target_type: 'store', target: '100', start: '2026-01-01' },
      { person: 'P7', role: 'gm', target_type: 'store', target: '200', start: '2027-01-01' }, // next year
    ];
    expect(personAssignmentTimeline('P7', '2026-01-01', '2026-12-31', rows))
      .toEqual([{ role: 'gm', loc: '100', start: '2026-01-01', end: '2026-12-31' }]);
  });
  it('unpads a zero-padded store target, matching every other function in this file', () => {
    const rows = [{ person: 'P8', role: 'gm', target_type: 'store', target: '0000100', start: '2026-01-01' }];
    expect(personAssignmentTimeline('P8', ...YEAR, rows)[0].loc).toBe('100');
  });
});
