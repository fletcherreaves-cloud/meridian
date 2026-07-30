import { describe, it, expect } from 'vitest';
import { computeCountTiming, fmtDurationHMS } from '../engine/eom-item-journey.js';

const item = (events) => ({ wrin: 'w', history: events });

describe('computeCountTiming — last count date, start→end', () => {
  it('uses the LAST count date and its earliest→latest recorded time', () => {
    const rawItems = [
      item([{ isCount: true, dt: '2026-07-29', tm: '7:30 AM' }]),                              // earlier day (not the duration)
      item([{ isCount: true, dt: '2026-07-31', tm: '8:15 AM' }, { isCount: true, dt: '2026-07-31', tm: '9:45 AM' }]),
      item([{ isCount: false, dt: '2026-07-31', tm: '6:00 AM', source: 'received' }]),          // non-count ignored
    ];
    const r = computeCountTiming(rawItems);
    expect(r.countDate).toBe('2026-07-31');
    expect(r.beganTm).toBe('8:15 AM');
    expect(r.endedTm).toBe('9:45 AM');
    expect(r.durationMs).toBe(90 * 60 * 1000); // 1h30m on the last date
    expect(r.nCountsLastDay).toBe(2);
    expect(r.nCountsTotal).toBe(3);
    expect(r.nDays).toBe(2);
    expect(r.hasTimes).toBe(true);
  });

  it('returns null when there are no timestamped count events', () => {
    expect(computeCountTiming([item([{ isCount: false, dt: '2026-07-31' }])])).toBeNull();
    expect(computeCountTiming([])).toBeNull();
  });

  it('flags bulkSubmit when the last day\'s counts all share one timestamp', () => {
    const r = computeCountTiming([item([
      { isCount: true, dt: '2026-07-31', tm: '9:00 AM' },
      { isCount: true, dt: '2026-07-31', tm: '9:00 AM' },
      { isCount: true, dt: '2026-07-31', tm: '9:00 AM' },
    ])]);
    expect(r.nDistinctTimes).toBe(1);
    expect(r.bulkSubmit).toBe(true);
  });

  it('flags bulkSubmit when one timestamp dominates + a few stragglers (Ada 6972 case)', () => {
    // ~28 items @ 11:43, 2 stragglers @ 12:16 = whole count bulk-submitted, two added after.
    const at = tm => ({ isCount: true, dt: '2026-07-31', tm });
    const items = [];
    for (let i = 0; i < 28; i++) items.push({ wrin: `b${i}`, history: [at('11:43 AM')] });
    items.push({ wrin: 'mccrispy', history: [at('12:16 PM')] });
    items.push({ wrin: 'lemons', history: [at('12:16 PM')] });
    const r = computeCountTiming(items);
    expect(r.bulkSubmit).toBe(true);
    expect(r.allSame).toBe(false);
    expect(r.domCount).toBe(28);
    expect(r.nStragglers).toBe(2);
    expect(r.domTm).toBe('11:43 AM');
  });

  it('does NOT flag bulkSubmit for a real travel-path time spread', () => {
    const r = computeCountTiming([item([
      { isCount: true, dt: '2026-07-31', tm: '8:15 AM' },
      { isCount: true, dt: '2026-07-31', tm: '9:45 AM' },
    ])]);
    expect(r.bulkSubmit).toBe(false);
    expect(r.nDistinctTimes).toBe(2);
  });

  it('nDays excludes EARLY-counted items — all-counted-today reads 1 day even with old early counts', () => {
    const items = [
      { wrin: 'a', history: [{ isCount: true, dt: '2026-07-30', tm: '11:16 AM' }] },
      { wrin: 'b', history: [{ isCount: true, dt: '2026-07-30', tm: '11:16 AM' }] },
      { wrin: 'early', history: [{ isCount: true, dt: '2026-07-22', tm: '9:00 AM' }] }, // early, never recounted
    ];
    const r = computeCountTiming(items);
    expect(r.countDate).toBe('2026-07-30');
    expect(r.nDays).toBe(1);   // the 07-22 early item is NOT part of "the count"
  });

  it('nDays = 2 for a genuine two-day FINAL count (consecutive recent days)', () => {
    const items = [
      { wrin: 'a', history: [{ isCount: true, dt: '2026-07-29', tm: '4:00 PM' }] },
      { wrin: 'b', history: [{ isCount: true, dt: '2026-07-30', tm: '9:00 AM' }] },
    ];
    expect(computeCountTiming(items).nDays).toBe(2);
  });

  it('hasTimes false + duration 0 when the last count has no time recorded', () => {
    const r = computeCountTiming([item([{ isCount: true, dt: '2026-07-31' }])]);
    expect(r.hasTimes).toBe(false);
    expect(r.durationMs).toBe(0);
    expect(r.countDate).toBe('2026-07-31');
  });
});

describe('fmtDurationHMS', () => {
  it('formats a ms duration as Hh Mm Ss', () => {
    expect(fmtDurationHMS(90 * 60 * 1000)).toBe('1h 30m 0s');
    expect(fmtDurationHMS(45 * 60 * 1000 + 30 * 1000)).toBe('45m 30s');
    expect(fmtDurationHMS(0)).toBe('0m 0s');
    expect(fmtDurationHMS(null)).toBe('—');
  });
});
