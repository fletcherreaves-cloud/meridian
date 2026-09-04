// @ts-nocheck
// attention-now.js's unpad had zero direct test coverage despite being live: imported directly
// by patch-heatmap.js, analytics.js, and bullseye-tile.js to strip a store loc's zero-padding
// for display.
import { describe, it, expect } from 'vitest';
import { unpad } from '../views/attention-now.js';

describe('unpad', () => {
  it('strips leading zeros from a zero-padded store number', () => {
    expect(unpad('0005985')).toBe('5985');
    expect(unpad('0000001')).toBe('1');
  });

  it('leaves a number with no leading zeros unchanged', () => {
    expect(unpad('5985')).toBe('5985');
  });

  it('a single "0" strips to empty, then falls back to the original "0"', () => {
    expect(unpad('0')).toBe('0');
  });

  it('an all-zero multi-digit string strips to empty, then falls back to the ORIGINAL unstripped string -- not "0"', () => {
    expect(unpad('0000000')).toBe('0000000');
  });

  it('returns empty string for falsy input (0, null, undefined, "")', () => {
    expect(unpad(0)).toBe('');
    expect(unpad(null)).toBe('');
    expect(unpad(undefined)).toBe('');
    expect(unpad('')).toBe('');
  });
});
