// @ts-nocheck
// labor-standard.js's fracToHour had zero direct test coverage despite being live: called
// internally (labor-standard.js:274) to convert a fractional-day value into hours.
import { describe, it, expect } from 'vitest';
import { fracToHour } from '../engine/labor-standard.js';

describe('fracToHour', () => {
  it('converts a fraction of a day into hours', () => {
    expect(fracToHour(0.5)).toBe(12);
    expect(fracToHour(1)).toBe(24);
    expect(fracToHour(0.25)).toBe(6);
  });

  it('returns null for null or undefined, without coercing to 0', () => {
    expect(fracToHour(null)).toBeNull();
    expect(fracToHour(undefined)).toBeNull();
  });

  it('treats 0 as a real value, not as missing', () => {
    expect(fracToHour(0)).toBe(0);
  });
});
