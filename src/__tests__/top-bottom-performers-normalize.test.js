// @ts-nocheck
// views/top-bottom-performers.js's normalize() had no value-level coverage: the existing
// top-bottom-performers-panel.test.js asserts ranking ORDER and disclaimer text extensively but
// never the rendered bar's score/width. normalize() is what PerformerRow (line 53) feeds into
// Bar's score prop -- a min-max scale relative to the OTHER ranked rows in the same scope/
// window/metric, with direction folded in so a "lower is better" metric's smallest value still
// draws the longest (best) bar.
import { describe, it, expect } from 'vitest';
import { normalize } from '../views/top-bottom-performers.js';

const rows = [{ value: 10 }, { value: 20 }, { value: 30 }];

describe('normalize', () => {
  it('returns 0 for an empty row list', () => {
    expect(normalize(50, [], 'higher')).toBe(0);
  });

  it('maps the lowest value to 0 and highest to 100 for a "higher is better" metric', () => {
    expect(normalize(10, rows, 'higher')).toBe(0);
    expect(normalize(30, rows, 'higher')).toBe(100);
    expect(normalize(20, rows, 'higher')).toBe(50);
  });

  it('inverts the scale for a "lower is better" metric -- smallest value draws the longest bar', () => {
    expect(normalize(10, rows, 'lower')).toBe(100);
    expect(normalize(30, rows, 'lower')).toBe(0);
    expect(normalize(20, rows, 'lower')).toBe(50);
  });

  it('returns 100 when every row shares the same value, regardless of direction (hi===lo guard)', () => {
    const tied = [{ value: 5 }, { value: 5 }, { value: 5 }];
    expect(normalize(5, tied, 'higher')).toBe(100);
    expect(normalize(5, tied, 'lower')).toBe(100);
  });

  it('handles a single-row list the same way as a tied list (hi===lo)', () => {
    const single = [{ value: 42 }];
    expect(normalize(42, single, 'higher')).toBe(100);
  });
});
