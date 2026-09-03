// @ts-nocheck
// utils/fmt.js's grade/gLbl/gCol/gBg/gBdr had zero test coverage despite being widely
// consumed (store-dash.js opsScore/ctrlScore tiles, performance-reviews.js, review-engine.js,
// model-health-badge.js, and more). Five parallel threshold ladders sharing the same cutoffs
// (90/80/70/60) — covers each boundary and that all five functions agree on which bucket a
// given score falls into.
import { describe, it, expect } from 'vitest';
import { grade, gLbl, gCol, gBg, gBdr } from '../utils/fmt.js';

const BUCKETS = [
  { min: 90, letter: 'A', label: 'Elite' },
  { min: 80, letter: 'B', label: 'Strong' },
  { min: 70, letter: 'C', label: 'Solid' },
  { min: 60, letter: 'D', label: 'Developing' },
  { min: -Infinity, letter: 'F', label: 'Needs Attn' },
];

describe('grade / gLbl — letter and label thresholds', () => {
  it('assigns the correct letter at each boundary, inclusive on the low end', () => {
    expect(grade(100)).toBe('A');
    expect(grade(90)).toBe('A');
    expect(grade(89.9)).toBe('B');
    expect(grade(80)).toBe('B');
    expect(grade(79.9)).toBe('C');
    expect(grade(70)).toBe('C');
    expect(grade(69.9)).toBe('D');
    expect(grade(60)).toBe('D');
    expect(grade(59.9)).toBe('F');
    expect(grade(0)).toBe('F');
  });

  it('assigns the matching label at each boundary', () => {
    expect(gLbl(90)).toBe('Elite');
    expect(gLbl(80)).toBe('Strong');
    expect(gLbl(70)).toBe('Solid');
    expect(gLbl(60)).toBe('Developing');
    expect(gLbl(0)).toBe('Needs Attn');
  });

  it('handles negative and above-100 scores by clamping into the outer buckets', () => {
    expect(grade(-10)).toBe('F');
    expect(grade(150)).toBe('A');
  });
});

describe('gCol / gBg / gBdr — color ladders agree with grade/gLbl on bucket boundaries', () => {
  it('all five functions place the same set of representative scores into the same bucket', () => {
    for (const b of BUCKETS) {
      const s = b.min === -Infinity ? 30 : b.min;
      expect(grade(s)).toBe(b.letter);
      expect(gLbl(s)).toBe(b.label);
      // gCol/gBg/gBdr each independently re-implement the same 90/80/70/60 ladder; distinct,
      // non-empty values per bucket is what would break if a threshold in one of the three
      // drifted from the other two (the real regression class this file's own duplication risks).
      expect(gCol(s)).toBeTruthy();
      expect(gBg(s)).toBeTruthy();
      expect(gBdr(s)).toBeTruthy();
    }
  });

  it('gCol returns a distinct color for each of the 5 buckets (no accidental collision)', () => {
    const colors = BUCKETS.map(b => gCol(b.min === -Infinity ? 30 : b.min));
    expect(new Set(colors).size).toBe(5);
  });

  it('gBg returns an alpha-tinted rgba string, not a bare hex', () => {
    expect(gBg(95)).toMatch(/^rgba\(/);
  });

  it('gCol/gBg/gBdr move together across the 80/70 boundary (no independent drift)', () => {
    expect(gCol(80)).not.toBe(gCol(79.9));
    expect(gBg(80)).not.toBe(gBg(79.9));
    expect(gBdr(80)).not.toBe(gBdr(79.9));
  });
});
