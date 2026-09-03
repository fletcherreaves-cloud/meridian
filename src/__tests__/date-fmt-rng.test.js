// @ts-nocheck
// date.js's fmtRng and rngMode had zero direct test coverage despite being live: both called
// from src/app/shell.js's date-range picker to label a range and classify it relative to today.
import { describe, it, expect } from 'vitest';
import { fmtRng, rngMode } from '../utils/date.js';

describe('fmtRng', () => {
  it('formats a same-day range as a single date', () => {
    const d = new Date(2026, 7, 15);
    expect(fmtRng(d, d)).toBe('Aug 15, 2026');
  });

  it('formats a multi-day range as start (no year) – end (with year)', () => {
    expect(fmtRng(new Date(2026, 7, 10), new Date(2026, 7, 15))).toBe('Aug 10 – Aug 15, 2026');
  });
});

describe('rngMode', () => {
  const DAY = 86400000;
  const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
  const daysFromToday = n => new Date(today().getTime() + n * DAY);

  it('classifies a range entirely after today as "future"', () => {
    expect(rngMode(daysFromToday(1), daysFromToday(2))).toBe('future');
  });

  it('classifies a range entirely before today as "past"', () => {
    expect(rngMode(daysFromToday(-2), daysFromToday(-1))).toBe('past');
  });

  it('classifies a range spanning today as "mixed"', () => {
    expect(rngMode(daysFromToday(-1), daysFromToday(1))).toBe('mixed');
  });

  it('classifies today-only as "mixed" (neither strictly future nor past)', () => {
    expect(rngMode(daysFromToday(0), daysFromToday(0))).toBe('mixed');
  });
});
