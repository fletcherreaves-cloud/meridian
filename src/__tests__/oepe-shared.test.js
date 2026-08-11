// @ts-nocheck
// #183/#184 item 3: one shared OEPE definition for src/views/graded-visits.js (per-hour rows)
// and src/lib/supabase.js's loadQsrActSummary (day-summed pseudo-rows). Reconciled against a
// real QSRSoft Service report (r=0.9958, 2026-08-11): subtract dt_heldtime, keep every car in
// the denominator.
import { describe, it, expect } from 'vitest';
import { oepeSeconds, oepeWithParkSeconds } from '../utils/oepe.js';

describe('oepeSeconds — excludes parked/held time', () => {
  it('subtracts dt_heldtime from the window before dividing by transaction count', () => {
    // dt_untilserve=200000ms total window, dt_untilstore=20000ms travel, dt_heldtime=30000ms held,
    // dt_trans_cnt=10 cars. (200000-20000-30000)/10/1000 = 15s
    const row = { dt_untilserve: 200000, dt_untilstore: 20000, dt_heldtime: 30000, dt_trans_cnt: 10 };
    expect(oepeSeconds(row)).toBe(15);
  });

  it('treats a missing dt_heldtime as 0 (no parked time recorded), not null-propagating', () => {
    const row = { dt_untilserve: 200000, dt_untilstore: 20000, dt_trans_cnt: 10 };
    expect(oepeSeconds(row)).toBe(18); // (200000-20000-0)/10/1000
  });

  it('returns null when dt_untilstore is not positive (no real DT activity)', () => {
    expect(oepeSeconds({ dt_untilserve: 0, dt_untilstore: 0, dt_trans_cnt: 5 })).toBeNull();
  });

  it('returns null when dt_trans_cnt is 0 (division guard)', () => {
    expect(oepeSeconds({ dt_untilserve: 200000, dt_untilstore: 20000, dt_trans_cnt: 0 })).toBeNull();
  });
});

describe('oepeWithParkSeconds — named diagnostic, the pre-#183 formula', () => {
  it('does NOT subtract dt_heldtime — always >= oepeSeconds for the same row', () => {
    const row = { dt_untilserve: 200000, dt_untilstore: 20000, dt_heldtime: 30000, dt_trans_cnt: 10 };
    expect(oepeWithParkSeconds(row)).toBe(18); // (200000-20000)/10/1000
    expect(oepeWithParkSeconds(row)).toBeGreaterThan(oepeSeconds(row));
  });

  it('equals oepeSeconds when there is no held time at all', () => {
    const row = { dt_untilserve: 200000, dt_untilstore: 20000, dt_heldtime: 0, dt_trans_cnt: 10 };
    expect(oepeWithParkSeconds(row)).toBe(oepeSeconds(row));
  });
});
