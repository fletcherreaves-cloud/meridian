// @ts-nocheck
// lifelenz.js's getShapeDeviationFlag had zero direct test coverage despite being live: called
// from computeLifeLenzAdjustment (same file), reachable from the real LifeLenzBridgePanel UI,
// to flag a qualitative traffic-shape note when a tagged event exists for the store/date.
import { describe, it, expect } from 'vitest';
import { getShapeDeviationFlag } from '../features/lifelenz.js';

const LOC = '3708';
const DATE = new Date(2026, 7, 15);
const DK = '2026-08-15';

describe('getShapeDeviationFlag', () => {
  it('returns null when there is no tagged event for this store/date', () => {
    expect(getShapeDeviationFlag(LOC, {}, DATE, {})).toBeNull();
    expect(getShapeDeviationFlag(LOC, {}, DATE, { [LOC]: {} })).toBeNull();
  });

  it('returns null when the event has no type with a shape-deviation note', () => {
    const userEvents = { [LOC]: { [DK]: { type: 'tech' } } }; // a real EVENT_TYPES key, but not in SHAPE_DEVIATION_NOTES
    expect(getShapeDeviationFlag(LOC, {}, DATE, userEvents)).toBeNull();
  });

  it('flags a plain-type (no tags) event that has a shape-deviation note, using the real label', () => {
    const userEvents = { [LOC]: { [DK]: { type: 'winter_storm', label: 'Big storm' } } };
    const flag = getShapeDeviationFlag(LOC, {}, DATE, userEvents);
    expect(flag.type).toBe('winter_storm');
    expect(flag.label).toBe('Winter Storm');
    expect(flag.note).toBe('Weather-driven timing shift — traffic often compresses into a narrow pre-storm window, then drops sharply.');
    expect(flag.eventLabel).toBe('Big storm');
  });

  it('picks the first tag whose type has a shape-deviation note, out of several tags', () => {
    const userEvents = { [LOC]: { [DK]: { tags: [{ type: 'tech' }, { type: 'road_closure' }] } } };
    expect(getShapeDeviationFlag(LOC, {}, DATE, userEvents).type).toBe('road_closure');
  });

  it('falls back to the event note when no label is set, and to an empty string when neither is', () => {
    const withNote = { [LOC]: { [DK]: { type: 'snow', note: 'heads up' } } };
    expect(getShapeDeviationFlag(LOC, {}, DATE, withNote).eventLabel).toBe('heads up');
    const bare = { [LOC]: { [DK]: { type: 'snow' } } };
    expect(getShapeDeviationFlag(LOC, {}, DATE, bare).eventLabel).toBe('');
  });
});
