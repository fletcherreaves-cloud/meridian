// @ts-nocheck
// views/scheduling.js's colorForLaborPct/colorForTPMH/colorForHrsDiff/weekBounds had zero test
// coverage despite being live -- called throughout SchedulingPanel (lazy-loaded in App.js) to
// color-code the labor%/TPMH/hours-variance metric cards and to bound the active schedule week.
import { describe, it, expect } from 'vitest';
import { colorForLaborPct, colorForTPMH, colorForHrsDiff, weekBounds } from '../views/scheduling.js';

const GREEN = '#22c55e', AMBER = '#f59e0b', RED = '#ef4444';
const TEXT2 = 'var(--text2,#94a3b8)', TEXT3 = 'var(--text3,#475569)';

describe('colorForLaborPct', () => {
  it('returns TEXT3 for a falsy value (0/null/undefined -- no data)', () => {
    expect(colorForLaborPct(0)).toBe(TEXT3);
    expect(colorForLaborPct(null)).toBe(TEXT3);
    expect(colorForLaborPct(undefined)).toBe(TEXT3);
  });

  it('returns GREEN below 19%, AMBER in [19,22), RED at or above 22%', () => {
    expect(colorForLaborPct(18.9)).toBe(GREEN);
    expect(colorForLaborPct(19)).toBe(AMBER);
    expect(colorForLaborPct(21.9)).toBe(AMBER);
    expect(colorForLaborPct(22)).toBe(RED);
    expect(colorForLaborPct(30)).toBe(RED);
  });
});

describe('colorForTPMH', () => {
  it('returns TEXT3 for a falsy value', () => {
    expect(colorForTPMH(0)).toBe(TEXT3);
    expect(colorForTPMH(null)).toBe(TEXT3);
  });

  it('returns GREEN at/above 6.0, AMBER in [5.0,6.0), RED below 5.0', () => {
    expect(colorForTPMH(6.0)).toBe(GREEN);
    expect(colorForTPMH(7)).toBe(GREEN);
    expect(colorForTPMH(5.0)).toBe(AMBER);
    expect(colorForTPMH(5.9)).toBe(AMBER);
    expect(colorForTPMH(4.9)).toBe(RED);
  });
});

describe('colorForHrsDiff', () => {
  it('returns TEXT2 (neutral) when the absolute difference is under 5', () => {
    expect(colorForHrsDiff(0)).toBe(TEXT2);
    expect(colorForHrsDiff(4.9)).toBe(TEXT2);
    expect(colorForHrsDiff(-4.9)).toBe(TEXT2);
  });

  it('returns RED for an over-hours diff of 5 or more, GREEN for an under-hours diff', () => {
    expect(colorForHrsDiff(5)).toBe(RED);
    expect(colorForHrsDiff(10)).toBe(RED);
    expect(colorForHrsDiff(-5)).toBe(GREEN);
    expect(colorForHrsDiff(-10)).toBe(GREEN);
  });
});

describe('weekBounds', () => {
  it('returns the Sunday-Saturday span containing the anchor date', () => {
    const anchor = new Date(2026, 0, 14); // some Wednesday-ish date -- day-of-week read at runtime
    const day = anchor.getDay();
    const { sun, sat } = weekBounds(anchor);
    expect(sun.getDay()).toBe(0);
    expect(sat.getDay()).toBe(6);
    expect(sun.getDate()).toBe(anchor.getDate() - day);
    // Exactly 6 days between sun and sat
    expect(Math.round((sat - sun) / 86400000)).toBe(6);
  });

  it('is idempotent when the anchor is already a Sunday', () => {
    // Walk forward from a known date until we hit a Sunday, so this doesn't assume a fixed calendar fact.
    let sundayAnchor = new Date(2026, 0, 1);
    while (sundayAnchor.getDay() !== 0) sundayAnchor.setDate(sundayAnchor.getDate() + 1);
    const { sun } = weekBounds(sundayAnchor);
    expect(sun.getDate()).toBe(sundayAnchor.getDate());
    expect(sun.getMonth()).toBe(sundayAnchor.getMonth());
  });
});
