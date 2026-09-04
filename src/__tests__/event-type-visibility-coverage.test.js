// @ts-nocheck
// Phase 2 of memory/project-events-calendar-redesign-2026-09-04.md — EVENT_TYPE_VISIBILITY
// (src/constants.js) supplies org_events.visibility's per-type default. Every EVENT_TYPES key
// must have an explicit entry so a newly-added type can't silently fall through to the generic
// 'calendar' fallback without a real, considered choice.
import { describe, it, expect } from 'vitest';
import { EVENT_TYPES, EVENT_TYPE_VISIBILITY, defaultVisibilityFor } from '../constants.js';

describe('EVENT_TYPE_VISIBILITY coverage', () => {
  it('has an explicit entry for every EVENT_TYPES key', () => {
    const missing = Object.keys(EVENT_TYPES).filter(k => !(k in EVENT_TYPE_VISIBILITY));
    expect(missing, 'EVENT_TYPES key(s) missing an EVENT_TYPE_VISIBILITY entry: ' + missing.join(', ')).toEqual([]);
  });

  it('every entry is a real visibility value (calendar or log)', () => {
    const bad = Object.entries(EVENT_TYPE_VISIBILITY).filter(([, v]) => v !== 'calendar' && v !== 'log');
    expect(bad, 'entries with an invalid visibility value: ' + JSON.stringify(bad)).toEqual([]);
  });

  it('has no stale entries for a type that no longer exists in EVENT_TYPES', () => {
    const stale = Object.keys(EVENT_TYPE_VISIBILITY).filter(k => !(k in EVENT_TYPES));
    expect(stale, 'EVENT_TYPE_VISIBILITY entries with no matching EVENT_TYPES key: ' + stale.join(', ')).toEqual([]);
  });

  it('defaultVisibilityFor() reads the map for a known type and falls back to calendar for an unknown one', () => {
    expect(defaultVisibilityFor('power')).toBe('log');
    expect(defaultVisibilityFor('sports')).toBe('calendar');
    expect(defaultVisibilityFor('__not_a_real_type__')).toBe('calendar');
  });

  // Spot-check the owner's own worked examples from the 2026-09-04 brief, so a future edit that
  // flips one of these needs to consciously touch this test, not just constants.js.
  it("matches the owner's own calendar-vs-log examples", () => {
    expect(defaultVisibilityFor('power')).toBe('log');       // "power was out at a location"
    expect(defaultVisibilityFor('sports')).toBe('calendar'); // "sporting events"
    expect(defaultVisibilityFor('event')).toBe('calendar');  // "concerts, festivals"
  });
});
