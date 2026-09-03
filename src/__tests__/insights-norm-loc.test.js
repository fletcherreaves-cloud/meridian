// @ts-nocheck
// insights.js's normLoc had zero direct test coverage despite being live: imported directly in
// pricing-engine.js, labor-tools.js, signals.js, and views/pricing-engine.js to normalize a loc
// before joining datasets. pricing-engine.test.js only exercises it indirectly through
// computeItemMargins()'s join behavior, never calls normLoc() by name.
import { describe, it, expect } from 'vitest';
import { normLoc } from '../engine/insights.js';

describe('normLoc', () => {
  it('strips leading zeros from a zero-padded numeric loc', () => {
    expect(normLoc('0003708')).toBe('3708');
  });

  it('passes a plain number through as a string', () => {
    expect(normLoc(3708)).toBe('3708');
  });

  it('strips non-digit characters and keeps just the digits', () => {
    expect(normLoc('Store #03708')).toBe('3708');
  });

  it('concatenates multiple digit runs when non-digits sit between them (documented behavior, not a guess)', () => {
    expect(normLoc('A1B2')).toBe('12');
  });

  it('returns the raw string unchanged when it has no digits at all', () => {
    expect(normLoc('abc')).toBe('abc');
  });

  it('returns an empty string for null, undefined, or empty input', () => {
    expect(normLoc(null)).toBe('');
    expect(normLoc(undefined)).toBe('');
    expect(normLoc('')).toBe('');
  });
});
