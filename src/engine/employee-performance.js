// @ts-nocheck
// src/engine/employee-performance.js — Employee Performance metrics from LifeLenz's Data
// Explorer "Employee Performance" report (scripts/lifelenz-employee-performance-pull.mjs,
// supabase/schema-lifelenz-employee-performance.sql).
//
// Each raw row is ONE employee's rolling-window scorecard (attendance %, drop/pickup/swap
// activity, worked hours, discipline/commendations, leave days) for one (loc, geid, period_end)
// — refreshed daily, period_end advancing one day per run. Unlike compliance-audit.js/schedule-
// discipline.js (per-EVENT logs with no natural "latest snapshot" concept), every function here
// that answers "how is this store/employee doing right now" must first narrow to the single most
// recent period_end actually present — summing across multiple overlapping rolling windows would
// double-count the same shifts.
//
// "Good use" this file exists for, per CLAUDE.md's "Voice by role" rule (say the number AND the
// decision): a per-employee reliability scorecard richer than lifelenz_attendance_summary's
// store-only rollup. lowAttendanceEmployees names the decision directly — who is below the
// attendance floor, right now, with enough shifts scheduled that the number means something —
// not just a sortable table a GM has to interpret themselves.

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

/** The single most recent period_end present in `rows` (string, 'YYYY-MM-DD'), or null if
 *  `rows` is empty. Every "current state" function below filters to this date first. */
export function latestPeriodEnd(rows) {
  let latest = null;
  for (const r of (rows || [])) {
    if (r?.periodEnd && (!latest || r.periodEnd > latest)) latest = r.periodEnd;
  }
  return latest;
}

/** Rows for just the latest rolling window — the "current scorecard" cross-section every other
 *  function in this file operates on, so a caller holding the FULL raw-row history (many
 *  overlapping period_end values, one set per day the pull has run) gets exactly one row per
 *  employee, not an accidental sum across windows. */
export function latestPeriodRows(rows) {
  const latest = latestPeriodEnd(rows);
  if (!latest) return [];
  return (rows || []).filter(r => r.periodEnd === latest);
}

/** Per-store summary for the CURRENT (latest-period) scorecard — {loc, employeeCount,
 *  avgAttendanceRate, totalAbsences, totalLate, totalDisciplinaryActions, totalCommendations,
 *  totalWorkedHours}[], sorted by avgAttendanceRate ascending so the store most in need of
 *  attention surfaces first. avgAttendanceRate is a simple mean across employees who had at
 *  least one scheduled shift in the window (an employee with scheduled_count=0 has a null/
 *  undefined rate — including them would understate every store's real number for no reason). */
export function storePerformanceSummary(rows) {
  const current = latestPeriodRows(rows);
  const byLoc = new Map();
  for (const r of current) {
    if (!r || !r.loc) continue;
    const cur = byLoc.get(r.loc) || {
      loc: r.loc, employeeCount: 0, attendanceRateSum: 0, attendanceRateN: 0,
      totalAbsences: 0, totalLate: 0, totalDisciplinaryActions: 0, totalCommendations: 0, totalWorkedHours: 0,
    };
    cur.employeeCount += 1;
    if (num(r.attendanceRate) != null && num(r.scheduledCount) > 0) {
      cur.attendanceRateSum += r.attendanceRate;
      cur.attendanceRateN += 1;
    }
    cur.totalAbsences += num(r.absentCount) || 0;
    cur.totalLate += num(r.lateCount) || 0;
    cur.totalDisciplinaryActions += num(r.disciplinaryActionCount) || 0;
    cur.totalCommendations += num(r.commendationCount) || 0;
    cur.totalWorkedHours += num(r.totalWorkedHours) || 0;
    byLoc.set(r.loc, cur);
  }
  return [...byLoc.values()]
    .map(s => ({
      loc: s.loc, employeeCount: s.employeeCount,
      avgAttendanceRate: s.attendanceRateN > 0 ? s.attendanceRateSum / s.attendanceRateN : null,
      totalAbsences: s.totalAbsences, totalLate: s.totalLate,
      totalDisciplinaryActions: s.totalDisciplinaryActions, totalCommendations: s.totalCommendations,
      totalWorkedHours: s.totalWorkedHours,
    }))
    .sort((a, b) => (a.avgAttendanceRate ?? 100) - (b.avgAttendanceRate ?? 100));
}

/** The concrete, actionable list: employees in the CURRENT window whose attendance_rate is
 *  below `maxRate` (default 80 — below 4-in-5 scheduled shifts actually worked), with at least
 *  `minScheduled` (default 3) shifts scheduled so a brand-new hire's first lone shift can't
 *  register as a reliability problem. Sorted by attendanceRate ascending (worst first) —
 *  {loc, geid, employeeName, attendanceRate, absentCount, lateCount, scheduledCount,
 *  workedCount}[]. This is the panel's "who to have a conversation with" surface, not just a
 *  sortable column. */
export function lowAttendanceEmployees(rows, { minScheduled = 3, maxRate = 80 } = {}) {
  const current = latestPeriodRows(rows);
  return current
    .filter(r => num(r.scheduledCount) >= minScheduled && num(r.attendanceRate) != null && r.attendanceRate < maxRate)
    .map(r => ({
      loc: r.loc, geid: r.geid, employeeName: r.employeeName,
      attendanceRate: r.attendanceRate, absentCount: r.absentCount, lateCount: r.lateCount,
      scheduledCount: r.scheduledCount, workedCount: r.workedCount,
    }))
    .sort((a, b) => a.attendanceRate - b.attendanceRate);
}

/** One employee's scorecard across every period_end on file, oldest first — the trend line a
 *  drill-down/sparkline needs. {periodEnd, attendanceRate, absentCount, lateCount,
 *  scheduledCount, workedCount, totalWorkedHours}[]. */
export function employeeTrend(rows, geid) {
  if (!geid) return [];
  return (rows || [])
    .filter(r => r?.geid === geid)
    .map(r => ({
      periodEnd: r.periodEnd, attendanceRate: r.attendanceRate, absentCount: r.absentCount,
      lateCount: r.lateCount, scheduledCount: r.scheduledCount, workedCount: r.workedCount,
      totalWorkedHours: r.totalWorkedHours,
    }))
    .sort((a, b) => (a.periodEnd || '').localeCompare(b.periodEnd || ''));
}
