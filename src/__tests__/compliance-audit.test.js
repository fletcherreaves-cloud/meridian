// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { storeComplianceSummary, dailyComplianceAudit, categoryBreakdown, employeeViolationSummary } from '../engine/compliance-audit.js';

const ROWS = [
  { loc: '0003708', employeeName: 'Jordan Lee', shiftDate: '2026-10-25', category: 'Meal Break', costPenalty: 12.5, hourPenalty: 0.25, isDismissed: false },
  { loc: '0003708', employeeName: 'Jordan Lee', shiftDate: '2026-10-26', category: 'Meal Break', costPenalty: 10, hourPenalty: 0.25, isDismissed: true },
  { loc: '0003708', employeeName: 'Casey Nguyen', shiftDate: '2026-10-26', category: 'Rest Break', costPenalty: 5, hourPenalty: 0, isDismissed: false },
  { loc: '0005183', employeeName: 'Taylor Ford', shiftDate: '2026-10-27', category: null, costPenalty: 20, hourPenalty: 0.5, isDismissed: false },
];

describe('storeComplianceSummary', () => {
  it('aggregates per-store violation count / cost / hour penalty / dismissed rate', () => {
    const rows = storeComplianceSummary(ROWS);
    const s3708 = rows.find(r => r.loc === '0003708');
    expect(s3708.violationCount).toBe(3);
    expect(s3708.costPenaltySum).toBe(27.5);
    expect(s3708.hourPenaltySum).toBe(0.5);
    expect(s3708.dismissedCount).toBe(1);
    expect(s3708.dismissedRate).toBeCloseTo(1 / 3, 5);
    expect(s3708.lastViolationAt).toBe('2026-10-26');
  });

  it('sorts by costPenaltySum descending', () => {
    const rows = storeComplianceSummary(ROWS);
    expect(rows[0].loc).toBe('0003708'); // 27.5 > 20
  });

  it('drops rows missing loc rather than crashing', () => {
    expect(storeComplianceSummary([null, undefined, { employeeName: 'x', costPenalty: 5 }])).toEqual([]);
  });
});

describe('dailyComplianceAudit', () => {
  it('aggregates per-(loc,date)', () => {
    const rows = dailyComplianceAudit(ROWS);
    const day = rows.find(r => r.loc === '0003708' && r.date === '2026-10-26');
    expect(day.violationCount).toBe(2); // Jordan Lee + Casey Nguyen both on 10-26
    expect(day.costPenaltySum).toBe(15);
  });

  it('drops rows missing loc or shiftDate rather than crashing', () => {
    expect(dailyComplianceAudit([null, { loc: '0003708' }, { shiftDate: '2026-10-25' }])).toEqual([]);
  });
});

describe('categoryBreakdown', () => {
  it('aggregates per category, grouping null category as Uncategorized', () => {
    const rows = categoryBreakdown(ROWS);
    const mealBreak = rows.find(r => r.category === 'Meal Break');
    expect(mealBreak.violationCount).toBe(2);
    expect(mealBreak.costPenaltySum).toBe(22.5);
    const uncategorized = rows.find(r => r.category === 'Uncategorized');
    expect(uncategorized.violationCount).toBe(1);
    expect(uncategorized.costPenaltySum).toBe(20);
  });

  it('sorts by costPenaltySum descending', () => {
    const rows = categoryBreakdown(ROWS);
    expect(rows[0].costPenaltySum).toBeGreaterThanOrEqual(rows[1].costPenaltySum);
  });
});

describe('employeeViolationSummary', () => {
  it('aggregates per employee with distinct store list', () => {
    const rows = employeeViolationSummary(ROWS);
    const jordan = rows.find(r => r.employeeName === 'Jordan Lee');
    expect(jordan.violationCount).toBe(2);
    expect(jordan.costPenaltySum).toBe(22.5);
    expect(jordan.locs).toEqual(['0003708']);
  });

  it('sorts by violationCount descending', () => {
    const rows = employeeViolationSummary(ROWS);
    expect(rows[0].employeeName).toBe('Jordan Lee');
  });

  it('drops rows missing employeeName rather than crashing', () => {
    expect(employeeViolationSummary([null, { loc: '0003708', costPenalty: 5 }])).toEqual([]);
  });
});
