// @ts-nocheck
// Unit tests for src/engine/daypart-peaks.js's aggregateAutoPeaks -- the hour_slot-to-daypart
// bucketing + ratio-of-sums math that replaces the stale manual "3 Peaks" upload. See
// dispatch-3peaks-autofirst-2026-11-16.test.js for the merge (autoFirstPeaks) and render-level
// (ShiftAnalysisTab) coverage.
import { describe, it, expect } from 'vitest';
import { aggregateAutoPeaks, DAYPART_HOUR_SLOTS, ALL_DAYPART_HOUR_SLOTS } from '../engine/daypart-peaks.js';

const LOC = '3708';

function hourRow(dt, hour_slot, overrides = {}) {
  return {
    loc: LOC, dt, hour_slot,
    product_sales: 0, transactions: 0,
    dt_untilserve: 0, dt_untilstore: 0, dt_heldtime: 0, dt_trans_cnt: 0, dt_carsheld: 0,
    fc_untilserve: 0, fc_untilclosedrawer: 0, fc_trans_cnt: 0,
    mfy1_untilserve: 0, mfy1_trans_cnt: 0, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
    actual_punched_hours: 0,
    ...overrides,
  };
}

describe('DAYPART_HOUR_SLOTS', () => {
  it('maps each daypart to the hour_slots covering its wall-clock window', () => {
    // Breakfast 7-9am = the 7-8am + 8-9am blocks -> hour_slot "08:00","09:00" (hour_slot is the
    // END of the block, per CLAUDE.md's qsr_daily_activity convention).
    expect(DAYPART_HOUR_SLOTS.breakfast).toEqual(['08:00', '09:00']);
    // Lunch 11am-2pm = 11-12, 12-1, 1-2pm.
    expect(DAYPART_HOUR_SLOTS.lunch).toEqual(['12:00', '13:00', '14:00']);
    // Dinner 5-7pm = 5-6, 6-7pm.
    expect(DAYPART_HOUR_SLOTS.dinner).toEqual(['18:00', '19:00']);
  });

  it('ALL_DAYPART_HOUR_SLOTS is the flattened union, used verbatim as the Supabase .in() filter', () => {
    expect(ALL_DAYPART_HOUR_SLOTS).toEqual(['08:00', '09:00', '12:00', '13:00', '14:00', '18:00', '19:00']);
  });
});

describe('aggregateAutoPeaks', () => {
  it('derives TPPH as Σtransactions ÷ Σactual_punched_hours across a daypart\'s hour_slots, summed first (not averaged per-hour)', () => {
    const rows = [
      hourRow('2026-11-10', '12:00', { transactions: 100, actual_punched_hours: 10 }),
      hourRow('2026-11-10', '13:00', { transactions: 150, actual_punched_hours: 15 }),
      hourRow('2026-11-10', '14:00', { transactions: 50, actual_punched_hours: 25 }),
    ];
    const out = aggregateAutoPeaks(rows, LOC, { s: '2026-11-01', e: '2026-11-15' });
    // Σtxns = 300, Σhours = 50 -> 6.0, NOT the mean of the three hourly ratios (10,10,2 -> 7.33).
    expect(out.lunch.tpph).toBeCloseTo(6.0, 5);
    expect(out.lunch.gc).toBe(300);
  });

  it('ignores hour_slots outside the three daypart windows entirely', () => {
    const rows = [
      hourRow('2026-11-10', '10:00', { transactions: 99999, actual_punched_hours: 1 }), // mid-morning, not a peak window
      hourRow('2026-11-10', '12:00', { transactions: 100, actual_punched_hours: 10 }),
    ];
    const out = aggregateAutoPeaks(rows, LOC, { s: '2026-11-01', e: '2026-11-15' });
    expect(out.lunch.gc).toBe(100); // the 10:00 row never entered any bucket
  });

  it('reuses the proven oepeSeconds()/R2P/KVS formulas, summing raw components across the window first', () => {
    const rows = [
      // Two breakfast hours, same day -- components should SUM before the ratio is taken.
      hourRow('2026-11-10', '08:00', {
        dt_untilserve: 500000, dt_untilstore: 100000, dt_heldtime: 0, dt_trans_cnt: 10,
        fc_untilserve: 200000, fc_untilclosedrawer: 50000, fc_trans_cnt: 5,
        mfy1_untilserve: 300000, mfy1_trans_cnt: 6, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
      }),
      hourRow('2026-11-10', '09:00', {
        dt_untilserve: 700000, dt_untilstore: 140000, dt_heldtime: 0, dt_trans_cnt: 14,
        fc_untilserve: 300000, fc_untilclosedrawer: 70000, fc_trans_cnt: 7,
        mfy1_untilserve: 0, mfy1_trans_cnt: 0, mfy2_untilserve: 420000, mfy2_trans_cnt: 8,
      }),
    ];
    const out = aggregateAutoPeaks(rows, LOC, { s: '2026-11-01', e: '2026-11-15' });
    // oepe = ((Σdt_untilserve - Σdt_untilstore) - Σheldtime) / Σdt_trans_cnt / 1000, rounded
    // Σdt_untilserve=1,200,000 Σdt_untilstore=240,000 Σdt_trans_cnt=24 -> (1,200,000-240,000)/24/1000 = 40s
    expect(out.breakfast.oepe).toBe(40);
    // r2p = (Σfc_untilserve - Σfc_untilclosedrawer) / Σfc_trans_cnt / 1000
    // Σfc_untilserve=500,000 Σfc_untilclosedrawer=120,000 Σfc_trans_cnt=12 -> 380,000/12/1000 = 31.67s
    expect(out.breakfast.r2p).toBeCloseTo(31.6667, 3);
    // kvst = (Σmfy1_untilserve+Σmfy2_untilserve) / (Σmfy1_trans_cnt+Σmfy2_trans_cnt) / 1000
    // Σserve=720,000 Σcnt=14 -> 51.43s
    expect(out.breakfast.kvst).toBeCloseTo(51.4286, 3);
  });

  it('filters by store loc and by the given date range, and only counts days actually seen', () => {
    const rows = [
      hourRow('2026-11-10', '12:00', { transactions: 100, actual_punched_hours: 10 }),
      hourRow('2026-11-11', '12:00', { transactions: 100, actual_punched_hours: 10 }),
      hourRow('2026-11-10', '12:00', { loc: '9999', transactions: 99999, actual_punched_hours: 1 }), // other store
      hourRow('2026-12-01', '12:00', { transactions: 99999, actual_punched_hours: 1 }), // outside range
    ];
    const out = aggregateAutoPeaks(rows, LOC, { s: '2026-11-01', e: '2026-11-15' });
    expect(out.lunch.gc).toBe(200);
    expect(out.lunch.count).toBe(2); // two distinct days seen
  });

  it('returns a real zero (count 0, every field 0) for a daypart/store with no matching rows at all -- never throws, never NaN', () => {
    const out = aggregateAutoPeaks([], LOC, { s: '2026-11-01', e: '2026-11-15' });
    for (const dp of ['breakfast', 'lunch', 'dinner']) {
      expect(out[dp].count).toBe(0);
      expect(out[dp].tpph).toBe(0);
      expect(Number.isNaN(out[dp].tpph)).toBe(false);
    }
  });
});
