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
