// @ts-nocheck
// parsers/index.js's isVoiceDaypartReport had zero direct test coverage despite being live: it
// routes PDF parsing (does this page belong to parseVoiceDaypartPDF or not) at its one call site.
import { describe, it, expect } from 'vitest';
import { isVoiceDaypartReport } from '../parsers/index.js';

describe('isVoiceDaypartReport', () => {
  it('returns true when a line contains the daypart marker', () => {
    expect(isVoiceDaypartReport(['SMG VOICE Report', 'Time of Day Performance', 'more'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVoiceDaypartReport(['TIME OF DAY PERFORMANCE'])).toBe(true);
  });

  it('matches the marker as a substring within a longer line', () => {
    expect(isVoiceDaypartReport(['  Time of Day Performance — Breakfast  '])).toBe(true);
  });

  it('returns false when no line contains the marker', () => {
    expect(isVoiceDaypartReport(['SMG VOICE Report', 'Overall Summary'])).toBe(false);
  });

  it('returns false for empty, null, or undefined input', () => {
    expect(isVoiceDaypartReport([])).toBe(false);
    expect(isVoiceDaypartReport(null)).toBe(false);
    expect(isVoiceDaypartReport(undefined)).toBe(false);
  });
});
