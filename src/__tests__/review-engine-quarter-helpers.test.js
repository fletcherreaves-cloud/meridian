// @ts-nocheck
// review-engine.js's qLabel/qMonths had zero direct test coverage despite being live: called
// repeatedly (13+ call sites) in src/views/performance-reviews.js for quarter labels/month
// lookups across the review UI and print/export paths.
import { describe, it, expect } from 'vitest';
import { qLabel, qMonths } from '../engine/review-engine.js';

describe('qLabel', () => {
  it('maps each quarter key to its display label', () => {
    expect(qLabel('q1')).toBe('Q1');
    expect(qLabel('q2')).toBe('Q2');
    expect(qLabel('q3')).toBe('Q3');
    expect(qLabel('q4')).toBe('Q4');
  });

  it('passes an unrecognized value through unchanged', () => {
    expect(qLabel('weird')).toBe('weird');
    expect(qLabel(null)).toBeNull();
  });
});

describe('qMonths', () => {
  it('maps each quarter key to its three calendar months', () => {
    expect(qMonths('q1')).toEqual([1, 2, 3]);
    expect(qMonths('q2')).toEqual([4, 5, 6]);
    expect(qMonths('q3')).toEqual([7, 8, 9]);
    expect(qMonths('q4')).toEqual([10, 11, 12]);
  });

  it('returns an empty array for an unrecognized quarter key', () => {
    expect(qMonths('weird')).toEqual([]);
    expect(qMonths(null)).toEqual([]);
  });
});
