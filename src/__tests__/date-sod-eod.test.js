// @ts-nocheck
// date.js's sodOf/eodOf had zero direct test coverage despite being live: used repeatedly
// inside date.js itself (rngMode, thisWeek) and imported elsewhere to anchor a trailing window
// to the correct calendar-day boundary.
import { describe, it, expect } from 'vitest';
import { sodOf, eodOf } from '../utils/date.js';

describe('sodOf', () => {
  it('zeroes the time to local midnight without changing the calendar date', () => {
    const d = new Date(2026, 7, 15, 14, 37, 22, 500);
    const r = sodOf(d);
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(7);
    expect(r.getDate()).toBe(15);
    expect(r.getHours()).toBe(0);
    expect(r.getMinutes()).toBe(0);
    expect(r.getSeconds()).toBe(0);
    expect(r.getMilliseconds()).toBe(0);
  });

  it('does not mutate the input Date', () => {
    const d = new Date(2026, 7, 15, 14, 0);
    const before = d.getTime();
    sodOf(d);
    expect(d.getTime()).toBe(before);
  });
});

describe('eodOf', () => {
  it('sets the time to the last millisecond of the local calendar day', () => {
    const d = new Date(2026, 7, 15, 9, 0);
    const r = eodOf(d);
    expect(r.getDate()).toBe(15);
    expect(r.getHours()).toBe(23);
    expect(r.getMinutes()).toBe(59);
    expect(r.getSeconds()).toBe(59);
    expect(r.getMilliseconds()).toBe(999);
  });

  it('does not mutate the input Date', () => {
    const d = new Date(2026, 7, 15, 9, 0);
    const before = d.getTime();
    eodOf(d);
    expect(d.getTime()).toBe(before);
  });
});
