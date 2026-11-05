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
 * {employmentId, name, loc, weekStart, hours, earnings, rate}. `hours`/`earnings` are the
 * BLENDED (regular+overtime) totals, dollar-weighted (Σearnings/Σhours for the week), never a
 * mean of daily rates -- same "never average averages" discipline as every other rate
 * computation in this app.
 *
 * `rate`, however, is the STRAIGHT-TIME rate whenever the regular/overtime split is available
 * (owner-caught 2026-11-05, real wage-accuracy bug): overtime is paid at 1.5x, measured
 * directly against real lifelenz_payroll_readiness rows (overtime_earnings/overtime_hours
 * consistently equals exactly 1.5x regular_earnings/regular_hours across every real OT row
 * sampled, not an assumption) -- so a week with ANY overtime would otherwise push the blended
 * earnings/hours rate above the employee's real base rate by however much OT that week
 * happened to carry, which can look like a raise or a cut in detectRateSteps() below when
 * nothing about the person's actual rate changed. `regEarnings`/`regSeconds` are summed
 * separately (Σ over segments where payType != 'overtime', from
 * engine/lifelenz-shift-jobs.js's shiftsForEmployeeSchedule, persisted once
 * supabase/schema-lifelenz-shift-pay-ot-split.sql has run) and `rate` prefers them whenever any
 * row this week actually carries the split (`hasSplit`) -- falling back to the blended rate
 * only for pre-migration rows (no split persisted at all: hasSplit stays false) or the rare
 * week that was 100% overtime (hasSplit true but zero regular seconds to divide by).
 */
export function weeklyCrewRates(shiftPayRows, shiftAssignmentRows) {
  const payByShift = new Map((shiftPayRows || []).map(r => [`${r.loc}|${r.shiftId}`, r]));
  const buckets = new Map(); // `${employmentId}|${weekStart}` -> {employmentId,name,loc,weekStart,hours,earnings,regHours,regEarnings,otHours,otEarnings}
  for (const a of (shiftAssignmentRows || [])) {
    if (!a || !a.assignedEmploymentId || !a.date) continue;
    const pay = payByShift.get(`${a.loc}|${a.shiftId}`);
    if (!pay) continue;
    const hours = _n(pay.seconds) / 3600;
    if (hours <= 0) continue;
    const weekStart = weekKeyOf(a.date);
    const key = `${a.assignedEmploymentId}|${weekStart}`;
    let b = buckets.get(key);
    if (!b) { b = { employmentId: a.assignedEmploymentId, name: a.employeeName || null, loc: a.loc, weekStart, hours: 0, earnings: 0, regHours: 0, regEarnings: 0, otHours: 0, otEarnings: 0 }; buckets.set(key, b); }
    b.hours += hours; b.earnings += _n(pay.earnings);
    b.regHours += _n(pay.regSeconds) / 3600; b.regEarnings += _n(pay.regEarnings);
    b.otHours += _n(pay.otSeconds) / 3600; b.otEarnings += _n(pay.otEarnings);
    if (!b.name && a.employeeName) b.name = a.employeeName;
  }
  return [...buckets.values()]
    .map(b => {
      const hasSplit = (b.regHours + b.otHours) > 0;
      const rate = hasSplit
        ? (b.regHours > 0 ? b.regEarnings / b.regHours : (b.hours > 0 ? b.earnings / b.hours : null))
        : (b.hours > 0 ? b.earnings / b.hours : null);
      return { ...b, rate, rateBasis: hasSplit ? (b.regHours > 0 ? 'straight-time' : 'blended (100% OT this week)') : 'blended (pre-split data)' };
    })
    .sort((a, b) => a.employmentId === b.employmentId ? a.weekStart.localeCompare(b.weekStart) : a.employmentId.localeCompare(b.employmentId));
}

// Rate jump worth calling a "change," not ordinary week-to-week noise (mix of roles; OT noise
// is now mostly removed by weeklyCrewRates' straight-time rate above, but the rate is still a
// dollar-weighted blend across roles/stations within a week, which can shift this much on its
// own). Same $0.20/hr judgment call as engine/pay-events.js's AROP_JUMP_THRESHOLD, for the same
// reason -- NOT independently measured for an individual's week-to-week rate variance; a real
// noise-threshold measurement (scripts/measure-coaching-noise-threshold.mjs's own methodology)
// would replace this if ever run for this specific series.
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
      // Owner-caught 2026-11-05: whether fromRate/toRate are each a clean straight-time rate or
      // (pre-migration data / a 100%-OT week) still a blended one -- surfaced so the panel can
      // flag a step that isn't fully OT-clean rather than presenting it as equally certain.
      fromRateBasis: valid[i - 1].rateBasis, toRateBasis: valid[i].rateBasis,
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

/**
 * Crew's own real, logged change events (owner request 2026-11-05) -- same shape as
 * managementRateChanges(), same source table (employee_pay_rate_changes), just the
 * source:'lifelenz_roster' rows scripts/lifelenz-pull.mjs's pullEmployeeRoster() writes instead
 * of source:'qsr_tenure'. A DELIBERATELY SEPARATE function (not a broadened filter on
 * managementRateChanges() above) because the two populations need different $ impact handling
 * downstream -- crew has a real measured-hours source (weeklyCrewRates(), same as the derived
 * detector), management doesn't (ASSUMED_MANAGEMENT_WEEKLY_HOURS) -- and mixing them into one
 * function would blur that distinction at the call site.
 *
 * personKey is a real LifeLenz assignedEmploymentId whenever the pull resolved the roster row's
 * name to one (see lifelenz-pull.mjs's resolveRosterPersonKeys) -- callers can join that back to
 * weeklyCrewRates() output for real hours. A personKey starting with 'name:' means the pull
 * could NOT resolve a real id (new hire with no shift history yet, or an ambiguous duplicate
 * name at that store) -- still a real logged change, just not joinable to measured hours.
 */
export function lifelenzRosterRateChanges(rows) {
  return (rows || [])
    .filter(r => r && r.source === 'lifelenz_roster')
    .map(r => ({
      personKey: r.personKey, loc: r.loc, name: r.employeeName, jobTitle: r.jobTitle,
      effectiveDate: r.effectiveDate, fromRate: r.priorRate, toRate: r.newRate, delta: r.newRate - r.priorRate,
      resolvedToEmploymentId: !String(r.personKey || '').startsWith('name:'),
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
