// @ts-nocheck
export default {version:'5.601', date:'2026-11-02', changes:[
  '**New: Employee Performance (Labor & Scheduling hub).** Third build against LifeLenz\'s Data ' +
  'Explorer (see v5.597\'s Schedule Variance, v5.599\'s Compliance Audit). Pulls the Employee ' +
  'Performance report daily -- a real per-employee reliability scorecard: attendance %, ' +
  'drop/pickup/swap activity, worked hours, discipline/commendations, leave days. Unlike its two ' +
  'siblings (per-event logs with a real date per row), this report has NO date column at all -- ' +
  'every column is a count/rate over the whole requested window for that employee -- so the new ' +
  '`lifelenz_employee_performance` table is keyed (loc, geid, period_end), a rolling-window ' +
  'snapshot refreshed daily, same shape as the existing `lifelenz_attendance_summary` but at the ' +
  'per-employee grain instead of a store-only rollup. New tab shows a per-store summary (avg ' +
  'attendance %, absences, discipline, commendations) and a concrete "Below 80% Attendance" flag ' +
  'list for the current window, not just a sortable table. Confirmed live via GetReportMeta: 30 ' +
  'real columns, all promoted (no PII -- none are ssn/DOB/address; employees_minor_age kept per ' +
  'the same precedent Compliance Audit already set).',
]};
