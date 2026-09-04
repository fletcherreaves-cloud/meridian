// @ts-nocheck
// one-pager.js's cascadeOf had zero direct test coverage despite being live: called internally
// (one-pager.js) and imported by forms-library.js to look up a cascade level's focus/priority/
// talking points by id.
import { describe, it, expect } from 'vitest';
import { cascadeOf, CASCADE_LEVELS } from '../views/one-pager.js';

describe('cascadeOf', () => {
  it('returns the matching cascade level for a known id', () => {
    expect(cascadeOf('d_s')).toBe(CASCADE_LEVELS.find(c => c.id === 'd_s'));
    expect(cascadeOf('d_s').label).toBe('DO → Supervisor');
  });

  it('finds each of the three defined levels', () => {
    expect(cascadeOf('o_d').label).toBe('Owner → DO');
    expect(cascadeOf('s_g').label).toBe('Supervisor → GM');
  });

  it('falls back to the first entry (o_d) for an unknown id', () => {
    expect(cascadeOf('bogus')).toBe(CASCADE_LEVELS[0]);
    expect(cascadeOf(null)).toBe(CASCADE_LEVELS[0]);
    expect(cascadeOf(undefined)).toBe(CASCADE_LEVELS[0]);
  });
});
