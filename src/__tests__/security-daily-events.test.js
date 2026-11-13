// @ts-nocheck
// src/engine/security-daily-events.js -- Phase 1 of the camera-hint fix (owner dispatch,
// 2026-11-12). Fixture numbers are Ryan A's own real audit_rows history at Holdenville (35064),
// scaled rate math left exact -- the case that prompted this file: a CASH-004-style rule flagged
// a ~28-day window at "157.18 per $1,000 drawer sales" against a 45.62 peer average, but only ONE
// of the days inside that window (2026-09-18) actually clears that rate on its own; the other
// three are at or below the peer average. deriveDailyBreaches() is what lets a caller tell the
// difference between "this subject has a real multi-week pattern" and "one outlier shift got
// smeared across a rolling window."
import { describe, it, expect } from 'vitest';
import { deriveDailyBreaches } from '../engine/security-daily-events.js';

// A CASH-004 shape: ratio rule, fixed threshold (no baseline needed for a plain ratio/threshold
// rule -- evaluateRule() only reads `baseline` on the z-score branch), scale 1000 (per $1,000),
// matching this repo's own per-$1,000-sales convention (CLAUDE.md / data-acquisition-shopping-
// list.md).
const CASH004_LIKE = {
  rule_id: 'CASH-004', logic_type: 'ratio', data_required: ['audit_rows'],
  logic_expression: {
    numerator: { field: 'promoAmt', agg: 'sum' },
    denominator: { field: 'drawerSales', agg: 'sum' },
    scale: 1000, comparator: 'gte',
  },
  threshold: { default: 100 },
};

// Ryan A's real manager-role rows, 2026-09-18 through 2026-10-10 (the flagged window's tail) --
// rate = promoAmt/drawerSales*1000: 9/18 = 157.18 (breach), 9/20 = 24.26, 10/8 = 45.90, 10/10 = 7.01.
const RYAN_A_ROWS = [
  { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-09-18', promoAmt: 90.00, drawerSales: 572.61 },
  { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-09-20', promoAmt: 87.41, drawerSales: 3603.45 },
  { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-10-08', promoAmt: 61.93, drawerSales: 1349.32 },
  { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-10-10', promoAmt: 3.79, drawerSales: 540.69 },
];

describe('deriveDailyBreaches() -- the Ryan A / CASH-004 / Holdenville case', () => {
  it('finds exactly the ONE day that actually clears the threshold, not all four days in the window', () => {
    const breaches = deriveDailyBreaches(CASH004_LIKE, RYAN_A_ROWS, 'audit_rows', null, 'date');
    expect(breaches).toHaveLength(1);
    expect(breaches[0].date).toBe('2026-09-18');
    expect(breaches[0].value).toBeCloseTo(157.18, 1);
    expect(breaches[0].thresholdUsed).toBe(100);
  });

  it('returns an empty array when no single day clears the threshold on its own (window still may read as flagged)', () => {
    const noOutlierDay = RYAN_A_ROWS.filter(r => r.date !== '2026-09-18');
    expect(deriveDailyBreaches(CASH004_LIKE, noOutlierDay, 'audit_rows', null, 'date')).toEqual([]);
  });

  it('sums multiple rows sharing the same date before evaluating -- a day is a day, not a row', () => {
    const splitSameDay = [
      { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-09-18', promoAmt: 45.00, drawerSales: 286.30 },
      { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-09-18', promoAmt: 45.00, drawerSales: 286.31 },
    ];
    // Summed: promoAmt=90.00, drawerSales=572.61 -> same 157.18 rate as the single-row case above.
    const breaches = deriveDailyBreaches(CASH004_LIKE, splitSameDay, 'audit_rows', null, 'date');
    expect(breaches).toHaveLength(1);
    expect(breaches[0].value).toBeCloseTo(157.18, 1);
  });

  it('sorts results chronologically, oldest first, when more than one day breaches', () => {
    const twoOutliers = [
      ...RYAN_A_ROWS,
      { loc: '0035064', empToken: 'tok-ryan-a', date: '2026-08-01', promoAmt: 50, drawerSales: 300 }, // rate 166.7
    ];
    const breaches = deriveDailyBreaches(CASH004_LIKE, twoOutliers, 'audit_rows', null, 'date');
    expect(breaches.map(b => b.date)).toEqual(['2026-08-01', '2026-09-18']);
  });

  it('rows with no date are excluded, never crash', () => {
    const withBadRow = [...RYAN_A_ROWS, { loc: '0035064', empToken: 'tok-ryan-a', date: null, promoAmt: 999, drawerSales: 1 }];
    expect(() => deriveDailyBreaches(CASH004_LIKE, withBadRow, 'audit_rows', null, 'date')).not.toThrow();
  });
});
