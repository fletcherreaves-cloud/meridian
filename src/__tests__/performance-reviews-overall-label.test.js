// @vitest-environment happy-dom
// @ts-nocheck
// views/performance-reviews.js's overallLabel() had zero test coverage despite being live --
// maps a review's 1-4 overall score into its display label, called from SummaryTab.
import { describe, it, expect } from 'vitest';
import { overallLabel } from '../views/performance-reviews.js';

describe('overallLabel', () => {
  it('returns an empty string when the score is null/undefined (no data yet)', () => {
    expect(overallLabel(null)).toBe('');
    expect(overallLabel(undefined)).toBe('');
  });

  it('returns "Needs Improvement" below 1.5', () => {
    expect(overallLabel(1)).toBe('Needs Improvement');
    expect(overallLabel(1.49)).toBe('Needs Improvement');
  });

  it('returns "Below Expectations" in [1.5, 2.5)', () => {
    expect(overallLabel(1.5)).toBe('Below Expectations');
    expect(overallLabel(2.49)).toBe('Below Expectations');
  });

  it('returns "Meets Expectations" in [2.5, 3.5)', () => {
    expect(overallLabel(2.5)).toBe('Meets Expectations');
    expect(overallLabel(3.49)).toBe('Meets Expectations');
  });

  it('returns "Exceeds Expectations" at/above 3.5', () => {
    expect(overallLabel(3.5)).toBe('Exceeds Expectations');
    expect(overallLabel(4)).toBe('Exceeds Expectations');
  });

  it('treats a score of exactly 0 as a real score, not "no data" (0 !== null)', () => {
    expect(overallLabel(0)).toBe('Needs Improvement');
  });
});
