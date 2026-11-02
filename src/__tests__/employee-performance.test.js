// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { latestPeriodEnd, latestPeriodRows, storePerformanceSummary, lowAttendanceEmployees, employeeTrend } from '../engine/employee-performance.js';

// Two overlapping rolling windows (yesterday's run + today's run) for the same employee at the
// same store — exactly what the daily pull produces. The "current" functions below must use
// ONLY the latest period_end, never sum across both.
const ROWS = [
  { loc: '0003708', geid: 'G1001', employeeName: 'Jordan Lee', periodStart: '2026-10-18', periodEnd: '2026-10-31', attendanceRate: 90, absentCount: 1, lateCount: 2, scheduledCount: 10, workedCount: 9, disciplinaryActionCount: 0, commendationCount: 0, totalWorkedHours: 40 },
  { loc: '0003708', geid: 'G1001', employeeName: 'Jordan Lee', periodStart: '2026-10-19', periodEnd: '2026-11-01', attendanceRate: 85, absentCount: 2, lateCount: 3, scheduledCount: 11, workedCount: 9, disciplinaryActionCount: 1, commendationCount: 0, totalWorkedHours: 42 },
  { loc: '0003708', geid: 'G1002', employeeName: 'Casey Nguyen', periodStart: '2026-10-19', periodEnd: '2026-11-01', attendanceRate: 60, absentCount: 4, lateCount: 1, scheduledCount: 10, workedCount: 6, disciplinaryActionCount: 0, commendationCount: 1, totalWorkedHours: 24 },
  { loc: '0005183', geid: 'G2001', employeeName: 'Taylor Ford', periodStart: '2026-10-19', periodEnd: '2026-11-01', attendanceRate: null, absentCount: 0, lateCount: 0, scheduledCount: 0, workedCount: 0, disciplinaryActionCount: 0, commendationCount: 0, totalWorkedHours: 0 },
];

describe('latestPeriodEnd / latestPeriodRows', () => {
  it('finds the single most recent period_end', () => {
    expect(latestPeriodEnd(ROWS)).toBe('2026-11-01');
  });
  it('returns null for an empty array', () => {
    expect(latestPeriodEnd([])).toBeNull();
  });
  it('filters to only rows from the latest window, dropping the stale overlapping one', () => {
    const current = latestPeriodRows(ROWS);
    expect(current).toHaveLength(3);
    expect(current.find(r => r.geid === 'G1001' && r.periodEnd === '2026-10-31')).toBeUndefined();
  });
});

describe('storePerformanceSummary', () => {
  it('aggregates the CURRENT window only, not both overlapping windows', () => {
    const rows = storePerformanceSummary(ROWS);
    const s3708 = rows.find(r => r.loc === '0003708');
    expect(s3708.employeeCount).toBe(2); // Jordan + Casey, current window only
    expect(s3708.avgAttendanceRate).toBeCloseTo((85 + 60) / 2, 5);
    expect(s3708.totalAbsences).toBe(6); // 2 + 4
    expect(s3708.totalDisciplinaryActions).toBe(1);
    expect(s3708.totalCommendations).toBe(1);
    expect(s3708.totalWorkedHours).toBe(66);
  });

  it('excludes an employee with scheduledCount 0 from the avg attendance rate (no denominator)', () => {
    const rows = storePerformanceSummary(ROWS);
    const s5183 = rows.find(r => r.loc === '0005183');
    expect(s5183.employeeCount).toBe(1);
    expect(s5183.avgAttendanceRate).toBeNull();
  });

  it('sorts worst (lowest) avgAttendanceRate first', () => {
    const rows = storePerformanceSummary(ROWS);
    expect(rows[0].loc).toBe('0003708'); // 72.5 avg < null (treated as 100, best-case, for sort)
  });

  it('drops rows missing loc rather than crashing', () => {
    expect(storePerformanceSummary([null, undefined, { geid: 'x' }])).toEqual([]);
  });
});

describe('lowAttendanceEmployees', () => {
  it('flags only employees below the default 80% floor with enough scheduled shifts', () => {
    const flagged = lowAttendanceEmployees(ROWS);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].geid).toBe('G1002');
    expect(flagged[0].attendanceRate).toBe(60);
  });

  it('excludes an employee below the rate but under minScheduled (too few shifts to mean anything)', () => {
    const rows = [{ loc: '0003708', geid: 'G3001', employeeName: 'New Hire', periodEnd: '2026-11-01', attendanceRate: 50, scheduledCount: 1, workedCount: 0 }];
    expect(lowAttendanceEmployees(rows)).toEqual([]);
  });

  it('respects custom minScheduled/maxRate thresholds', () => {
    const rows = [{ loc: '0003708', geid: 'G4001', employeeName: 'Edge Case', periodEnd: '2026-11-01', attendanceRate: 82, scheduledCount: 5, workedCount: 4 }];
    expect(lowAttendanceEmployees(rows, { maxRate: 90 })).toHaveLength(1);
    expect(lowAttendanceEmployees(rows, { maxRate: 80 })).toHaveLength(0);
  });

  it('never flags a null attendanceRate (no real denominator)', () => {
    expect(lowAttendanceEmployees(ROWS).some(r => r.geid === 'G2001')).toBe(false);
  });
});

describe('employeeTrend', () => {
  it('returns one employee\'s rows across every period_end, oldest first', () => {
    const trend = employeeTrend(ROWS, 'G1001');
    expect(trend).toHaveLength(2);
    expect(trend[0].periodEnd).toBe('2026-10-31');
    expect(trend[1].periodEnd).toBe('2026-11-01');
    expect(trend[0].attendanceRate).toBe(90);
    expect(trend[1].attendanceRate).toBe(85);
  });

  it('returns [] for an unknown geid or a missing geid argument', () => {
    expect(employeeTrend(ROWS, 'NOBODY')).toEqual([]);
    expect(employeeTrend(ROWS, null)).toEqual([]);
  });
});
