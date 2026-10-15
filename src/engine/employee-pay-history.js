// @ts-nocheck
// ── Employee pay-rate history + impact (owner request 2026-10-15) ────────────────────────────
// "Can we do a report for pay rates to show history of each employee's wages and rates of pay.
// I would envision being able to pull a report and see when a pay rate changes and be able to
// have analysis on its expected impact to overall labor in the restaurant."
//
// Two populations, two different data shapes, merged into one display contract by this file:
//   - CREW: no logged "change event" anywhere -- derived on demand from lifelenz_shift_pay's
//     raw per-shift earnings/seconds (joined to lifelenz_shift_assignments for name/date/loc).
//     weeklyCrewRates() aggregates to a weekly dollar-weighted rate per employee (smooths day-
//     to-day role/OT-mix noise, same reasoning pay-events.js's AROP_WINDOW_DAYS trailing window
//     uses); detectRateSteps() then walks that series for a real step.
//   - MANAGEMENT (GM/AM/DM/SM): already a logged change event (employee_pay_rate_changes,
//     written by scripts/qsrsoft-employee-roster-pull.mjs's diff-and-insert, since
//     qsr_employee_tenure itself keeps no history) -- managementRateChanges() just reshapes it,
//     nothing to detect.
//
// Individual-level impact is MORE precise than the store-level AROP work (engine/pay-events.js)
// for the same reason: Δrate x THIS PERSON'S OWN actual hours removes the staffing-mix noise
// that makes a store-level AROP jump ambiguous (a real raise vs. a shift in who's scheduled).

const _n = v => (typeof v === 'number' && isFinite(v)) ? v : 0;

// Monday-anchored ISO week key for a 'YYYY-MM-DD' date string -- plain date math, no business-
// day cutover involved (this is about which calendar week a SHIFT fell in, not a sales day).
function weekKeyOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Joins lifelenz_shift_pay (earnings/seconds, role-gated) to lifelenz_shift_assignments
 * (employmentId/name/loc/date) by shift_id, aggregates to one row per (employmentId, week):
 * {employmentId, name, loc, weekStart, hours, earnings, rate}. `rate` is dollar-weighted
 * (Σearnings/Σhours for the week), never a mean of daily rates -- same "never average
 * averages" discipline as every other rate computation in this app.
 */
export function weeklyCrewRates(shiftPayRows, shiftAssignmentRows) {
  const payByShift = new Map((shiftPayRows || []).map(r => [`${r.loc}|${r.shiftId}`, r]));
  const buckets = new Map(); // `${employmentId}|${weekStart}` -> {employmentId,name,loc,weekStart,hours,earnings}
  for (const a of (shiftAssignmentRows || [])) {
    if (!a || !a.assignedEmploymentId || !a.date) continue;
    const pay = payByShift.get(`${a.loc}|${a.shiftId}`);
    if (!pay) continue;
    const hours = _n(pay.seconds) / 3600;
    if (hours <= 0) continue;
    const weekStart = weekKeyOf(a.date);
    const key = `${a.assignedEmploymentId}|${weekStart}`;
    let b = buckets.get(key);
    if (!b) { b = { employmentId: a.assignedEmploymentId, name: a.employeeName || null, loc: a.loc, weekStart, hours: 0, earnings: 0 }; buckets.set(key, b); }
    b.hours += hours; b.earnings += _n(pay.earnings);
    if (!b.name && a.employeeName) b.name = a.employeeName;
  }
  return [...buckets.values()]
    .map(b => ({ ...b, rate: b.hours > 0 ? b.earnings / b.hours : null }))
    .sort((a, b) => a.employmentId === b.employmentId ? a.weekStart.localeCompare(b.weekStart) : a.employmentId.localeCompare(b.employmentId));
}

// Rate jump worth calling a "change," not ordinary week-to-week noise (mix of roles/OT). Same
// $0.20/hr judgment call as engine/pay-events.js's AROP_JUMP_THRESHOLD, for the same reason --
// NOT independently measured for an individual's week-to-week rate variance; a real noise-
// threshold measurement (scripts/measure-coaching-noise-threshold.mjs's own methodology) would
// replace this if ever run for this specific series.
export const RATE_STEP_THRESHOLD = 0.20;

/**
 * Walks one person's own weekly rate series (sorted by weekStart, as weeklyCrewRates already
 * returns) and returns every consecutive-week step >= threshold, either direction -- unlike
 * detectAropJumps (store-level, increases only), an individual's rate dropping is just as real
 * a "change" worth showing (a role change, a shift to a lower-paying station) since there's no
 * staffing-mix ambiguity to filter out at the individual level the way there is store-wide.
 */
export function detectRateSteps(series, threshold = RATE_STEP_THRESHOLD) {
  const steps = [];
  const valid = (series || []).filter(w => w.rate != null);
  for (let i = 1; i < valid.length; i++) {
    const delta = valid[i].rate - valid[i - 1].rate;
    if (Math.abs(delta) < threshold) continue;
    steps.push({
      weekStart: valid[i].weekStart, fromRate: valid[i - 1].rate, toRate: valid[i].rate, delta,
      hoursAtNewRate: valid[i].hours,
    });
  }
  return steps;
}

/**
 * Reshapes the already-detected (by the pull script's own diff) management rows into the same
 * display shape detectRateSteps() produces, grouped by person_key. Nothing to detect here --
 * employee_pay_rate_changes IS the change log.
 */
export function managementRateChanges(rows) {
  return (rows || [])
    .filter(r => r && r.source === 'qsr_tenure')
    .map(r => ({
      personKey: r.personKey, loc: r.loc, name: r.employeeName, jobTitle: r.jobTitle,
      effectiveDate: r.effectiveDate, fromRate: r.priorRate, toRate: r.newRate, delta: r.newRate - r.priorRate,
    }))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
}

// Management impact has no measured actual-hours source (qsr_employee_tenure carries no hours
// at all, and AM is typically salaried anyway per tenure-roles.js's hourly/salaried split) --
// a standard full-time week is the stated, flagged assumption, not a measurement. Crew impact
// below uses this person's OWN real hours instead -- no assumption needed there.
export const ASSUMED_MANAGEMENT_WEEKLY_HOURS = 40;

/** Δrate × weekly hours -> {weeklyDollarImpact, annualizedDollarImpact}. Pure dollar math, no I/O. */
export function payImpact(delta, weeklyHours) {
  if (delta == null || weeklyHours == null) return { weeklyDollarImpact: null, annualizedDollarImpact: null };
  const weeklyDollarImpact = delta * weeklyHours;
  return { weeklyDollarImpact, annualizedDollarImpact: weeklyDollarImpact * 52 };
}
