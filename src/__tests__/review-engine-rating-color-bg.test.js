// @ts-nocheck
// review-engine.js's ratingColor/ratingBg had zero direct test coverage despite being live and
// pervasive: 20+ call sites in src/views/performance-reviews.js render badge/cell colors from
// these two functions for every scored review category.
import { describe, it, expect } from 'vitest';
import { ratingColor, ratingBg } from '../engine/review-engine.js';

describe('ratingColor', () => {
  it('maps each of the four rating tiers to its own color', () => {
    expect(ratingColor(4)).toBe('#16a34a');
    expect(ratingColor(3)).toBe('#22c55e');
    expect(ratingColor(2)).toBe('var(--crit)');
    expect(ratingColor(1)).toBe('#dc2626');
  });

  it('falls back to the neutral text color for an unscored/unrecognized rating', () => {
    expect(ratingColor(null)).toBe('var(--text3)');
    expect(ratingColor(undefined)).toBe('var(--text3)');
    expect(ratingColor(0)).toBe('var(--text3)');
  });
});

describe('ratingBg', () => {
  it('maps each of the four rating tiers to its own translucent background', () => {
    expect(ratingBg(4)).toBe('rgba(22,163,74,.13)');
    expect(ratingBg(3)).toBe('rgba(34,197,94,.10)');
    expect(ratingBg(2)).toBe('rgba(244,63,94,.11)');
    expect(ratingBg(1)).toBe('rgba(220,38,38,.12)');
  });

  it('falls back to transparent for an unscored/unrecognized rating', () => {
    expect(ratingBg(null)).toBe('transparent');
    expect(ratingBg(undefined)).toBe('transparent');
    expect(ratingBg(0)).toBe('transparent');
  });
});
