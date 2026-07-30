import { describe, it, expect } from 'vitest';
import { whoRan, groupsAt, seedAssignmentsFromGroups } from '../constants.js';

describe('org assignments (tenure-based attribution)', () => {
  const asg = [
    { loc: '6178', supervisor: 'Brad', start: '' },            // since always
    { loc: '6178', supervisor: 'Mary', start: '2026-07-22' },  // reassigned to Mary
    { loc: '6838', supervisor: 'Brad', start: '' },
  ];

  it('whoRan picks the latest effective start ≤ the date', () => {
    expect(whoRan('6178', '2026-07-21', asg)).toBe('Brad');   // day before Mary starts
    expect(whoRan('6178', '2026-07-22', asg)).toBe('Mary');   // on Mary's start
    expect(whoRan('6178', '2026-08-01', asg)).toBe('Mary');   // after
    expect(whoRan('6838', '2026-08-01', asg)).toBe('Brad');   // never reassigned
  });

  it('handles zero-padded loc input', () => {
    expect(whoRan('0006178', '2026-07-22', asg)).toBe('Mary');
  });

  it('groupsAt derives the current map at a given date', () => {
    const now = groupsAt('2026-08-01', asg);
    expect(now.Mary).toContain('6178');
    expect(now.Brad).toContain('6838');
    expect(now.Brad || []).not.toContain('6178');

    const before = groupsAt('2026-07-01', asg);
    expect(before.Brad).toEqual(expect.arrayContaining(['6178', '6838']));
    expect(before.Mary).toBeUndefined();
  });

  it('seed makes open-start rows equivalent to the flat map', () => {
    const seed = seedAssignmentsFromGroups({ Brad: ['6178', '6838'], Mary: ['35242'] });
    expect(seed).toHaveLength(3);
    const g = groupsAt('2026-01-01', seed);
    expect(g.Brad).toEqual(expect.arrayContaining(['6178', '6838']));
    expect(g.Mary).toEqual(['35242']);
  });
});
