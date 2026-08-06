import { describe, it, expect } from 'vitest';
import { EVENT_TYPES, EVENT_TYPE_GROUPS } from '../constants.js';
import { impactWeight } from '../engine/events-import.js';

describe('training event type', () => {
  it('exists as its own type, not folded into `other`', () => {
    // The Event Impact Registry keys on (loc, event_type). Bucketed into `other`,
    // training days could never earn a measured lift/drag of their own.
    expect(EVENT_TYPES.training).toBeTruthy();
    expect(EVENT_TYPES.training.label).toMatch(/training/i);
    expect(EVENT_TYPES.training.icon).toBeTruthy();
    expect(EVENT_TYPES.training.col).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('is reachable from the tag picker', () => {
    const inGroups = EVENT_TYPE_GROUPS.some(g => g.items.includes('training'));
    expect(inGroups).toBe(true);
  });

  it('carries zero assumed forecast impact until one is measured', () => {
    // Same rule v4.839 pinned for retail events: measured lift beats assumed lift.
    expect(impactWeight(null)).toBe(0);
    expect(impactWeight({})).toBe(0);
    expect(impactWeight({ magnitude: 'Low' })).toBe(0);
  });
});

describe('EVENT_TYPE_GROUPS integrity', () => {
  it('references only types that actually exist', () => {
    const unknown = EVENT_TYPE_GROUPS
      .flatMap(g => g.items)
      .filter(t => !EVENT_TYPES[t]);
    expect(unknown).toEqual([]);
  });

  it('does not list the same type in two groups', () => {
    const all = EVENT_TYPE_GROUPS.flatMap(g => g.items);
    expect(all.length).toBe(new Set(all).size);
  });
});
