import { describe, it, expect } from 'vitest';
import { computeCountTiming, fmtDurationMin } from '../engine/eom-item-journey.js';

const item = (events) => ({ wrin: 'w', history: events });

describe('computeCountTiming', () => {
  it('finds the earliest begin + latest end across all items and the span', () => {
    const rawItems = [
      item([{ isCount: true, dt: '2026-07-29', tm: '8:15 AM' }, { isCount: true, dt: '2026-07-29', tm: '9:00 AM' }]),
      item([{ isCount: true, dt: '2026-07-29', tm: '7:30 AM' }]),          // earliest overall
      item([{ isCount: false, dt: '2026-07-29', tm: '6:00 AM', source: 'received' }]), // non-count ignored
      item([{ isCount: true, dt: '2026-07-30', tm: '10:45 AM' }]),          // latest overall (next day)
    ];
    const r = computeCountTiming(rawItems);
    expect(r.beganDt).toBe('2026-07-29'); expect(r.beganTm).toBe('7:30 AM');
    expect(r.endedDt).toBe('2026-07-30'); expect(r.endedTm).toBe('10:45 AM');
    expect(r.nCounts).toBe(4);       // only isCount events
    expect(r.nDays).toBe(2);
    expect(r.hasTimes).toBe(true);
    // span: 7:30am 7/29 → 10:45am 7/30 = 27h15m = 1635 min
    expect(r.durationMin).toBe(27 * 60 + 15);
  });

  it('returns null when there are no timestamped count events', () => {
    expect(computeCountTiming([item([{ isCount: false, dt: '2026-07-29' }])])).toBeNull();
    expect(computeCountTiming([])).toBeNull();
  });

  it('handles date-only counts (no time) — hasTimes false, day-level span', () => {
    const r = computeCountTiming([item([{ isCount: true, dt: '2026-07-29' }, { isCount: true, dt: '2026-07-31' }])]);
    expect(r.hasTimes).toBe(false);
    expect(r.durationMin).toBe(2 * 24 * 60); // 2 days
  });
});

describe('fmtDurationMin', () => {
  it('formats minutes / hours / days', () => {
    expect(fmtDurationMin(45)).toBe('45m');
    expect(fmtDurationMin(135)).toBe('2h 15m');
    expect(fmtDurationMin(120)).toBe('2h');
    expect(fmtDurationMin(27 * 60 + 15)).toBe('1d 3h');
    expect(fmtDurationMin(null)).toBe('—');
  });
});
