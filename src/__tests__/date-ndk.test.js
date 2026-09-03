// @ts-nocheck
// date.js's nDK had zero direct test coverage despite being live: 18+ call sites (App.js,
// analytics.js, calendar.js, and more) use it to normalize any date-key representation
// (Date object, full ISO datetime, or date-only string) to a plain YYYY-MM-DD string so
// storage format never drifts.
import { describe, it, expect } from 'vitest';
import { nDK } from '../utils/date.js';

describe('nDK', () => {
  it('returns an empty string for null, undefined, or empty input', () => {
    expect(nDK(null)).toBe('');
    expect(nDK(undefined)).toBe('');
    expect(nDK('')).toBe('');
  });

  it('normalizes a Date object to its local YYYY-MM-DD', () => {
    expect(nDK(new Date(2026, 7, 15, 10, 30))).toBe('2026-08-15');
  });

  it('strips the time portion off a full ISO datetime string', () => {
    expect(nDK('2023-11-23T12:00:00.000Z')).toBe('2023-11-23');
  });

  it('passes a date-only string through unchanged', () => {
    expect(nDK('2025-07-15')).toBe('2025-07-15');
  });
});
