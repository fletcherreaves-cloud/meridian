// @ts-nocheck
// date.js's spanTagInfo had zero direct test coverage despite being live: called from
// src/views/store-analytics.js and src/views/at-a-glance.js to render the "As of" per-tile
// freshness tag. The same-named dispatch-168-span-tag.test.js deliberately renders the real
// panel component instead of calling spanTagInfo directly (per its own header comment) --
// a textbook case of a same-named test file that doesn't actually cover the function.
import { describe, it, expect } from 'vitest';
import { spanTagInfo } from '../utils/date.js';

const TODAY = new Date(2026, 7, 20); // Aug 20, 2026

describe('spanTagInfo', () => {
  it('returns null when no row has a date on or before today', () => {
    expect(spanTagInfo([], TODAY, {})).toBeNull();
    expect(spanTagInfo([{ date: new Date(2026, 7, 25) }], TODAY, {})).toBeNull(); // future-dated, excluded
  });

  it('formats a single-day span as one date and "1 day present"', () => {
    const r = spanTagInfo([{ date: new Date(2026, 7, 15) }], TODAY, {});
    expect(r.text).toBe('8/15');
    expect(r.tip).toBe('Data shown spans 8/15 · 1 day present');
    expect(r.isFallback).toBe(false);
  });

  it('formats a multi-day span as start–end and counts distinct days', () => {
    const rows = [{ date: new Date(2026, 7, 10) }, { date: new Date(2026, 7, 15) }];
    const r = spanTagInfo(rows, TODAY, {});
    expect(r.text).toBe('8/10–8/15');
    expect(r.tip).toBe('Data shown spans 8/10–8/15 · 2 days present');
  });

  it('counts distinct CALENDAR days, not row count -- two rows on the same day count once', () => {
    const rows = [{ date: new Date(2026, 7, 10, 6) }, { date: new Date(2026, 7, 10, 18) }, { date: new Date(2026, 7, 15) }];
    const r = spanTagInfo(rows, TODAY, {});
    expect(r.tip).toContain('2 days present');
  });

  it('excludes a future-dated row from the span while keeping the past-dated ones', () => {
    const rows = [{ date: new Date(2026, 7, 10) }, { date: new Date(2026, 7, 25) }]; // 25th is after TODAY
    const r = spanTagInfo(rows, TODAY, {});
    expect(r.text).toBe('8/10');
  });

  it('skips rows with a missing or unparseable date instead of throwing', () => {
    const rows = [{ date: null }, {}, { date: new Date(2026, 7, 12) }];
    const r = spanTagInfo(rows, TODAY, {});
    expect(r.text).toBe('8/12');
  });

  it('appends the fallback warning with the caller-supplied label, and a ⚠ on the text', () => {
    const r = spanTagInfo([{ date: new Date(2026, 7, 12) }], TODAY, { isFallback: true, fallbackLabel: 'last 7 days' });
    expect(r.text).toBe('8/12 ⚠');
    expect(r.isFallback).toBe(true);
    expect(r.tip).toContain('⚠ No data in the selected period (last 7 days) — showing the most recent 30 days of available data instead.');
  });

  it('defaults the fallback label to "selected range" when omitted', () => {
    const r = spanTagInfo([{ date: new Date(2026, 7, 12) }], TODAY, { isFallback: true });
    expect(r.tip).toContain('(selected range)');
  });
});
