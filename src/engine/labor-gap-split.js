// @ts-nocheck
// ── Labor gap, split two ways (#210) ─────────────────────────────────────────
// qsr_daily_activity already carries total_needed_hours, total_scheduled_hours and
// actual_punched_hours, hourly — already-pulled data, no new source. Meridian today only
// shows the combined actual-vs-needed gap (actVsNeed). Split it:
//
//   Needed  -> Scheduled  =  PLANNING ACCURACY  ->  coach the scheduler / the forecast
//   Scheduled -> Actual   =  EXECUTION          ->  coach the shift manager
//
// One number becomes two coaching conversations aimed at two different people — the owner's
// "2 defined areas to coach and teach and push." The execution half catches unplanned
// extensions, missed cuts, and early clock-ins stacking labor before volume arrives.
//
// Wed–Tue is the PAY week, everywhere in this file, per the owner: "Leave the Wed start day
// of week everywhere in the app." His Mon–Sun preference is scoped to inventory count views
// only (memory/project-inventory-control-redesign.md §5) — labor hours are PAID Wed–Tue, and
// mixing a Mon–Sun window with Wed–Tue hours produces a labor % that is wrong and does NOT
// look wrong. PAY_WEEK_START is passed explicitly to weekStartOf/weekKeyOf rather than relying
// on their module-level default (also 3/Wed today) so a future settings change elsewhere can't
// silently change what THIS file means by "the pay week."
//
// Scheduled hours can be genuinely unknown, not just zero: qsr_daily_activity_rollup (the
// table loadQsrActSummary actually reads in production) has no total_scheduled_hours column
// until the owner runs supabase/schema-qsr-rollup-scheduled-hours.sql, and even after that,
// historical rows outside the pull's rolling re-cover window stay null. src/lib/supabase.js
// propagates that as darSchedHrs:null (not 0) for exactly this reason — a week containing any
// such row reports planningGapHrs/executionGapHrs as null here too, rather than a number built
// on a partial, silently-zero-filled sum. combinedGapHrs (actual-needed) has no such gap:
// both actual and needed have been carried by the rollup since before this feature.
import { weekStartOf, weekKeyOf, addD, dKey, lastClosedBusinessDay } from '../utils/date.js';

export const PAY_WEEK_START = 3; // Wednesday

/**
 * Per-store, per-pay-week hours split. `rows` = ds.qsrActSummaryRows shape:
 * {loc, date, needHrs, actHrs, darSchedHrs}. Excludes any day after the last CLOSED business
 * day (signature #4 — a day in progress is not a complete day) before bucketing into weeks.
 */
export function computeLaborGapSplit(rows = [], { asOf = null } = {}) {
  const lastClosed = lastClosedBusinessDay(asOf ? new Date(asOf) : undefined);
  const byGroup = {};
  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (Number.isNaN(d.getTime()) || d > lastClosed) continue;
    const weekKey = weekKeyOf(d, PAY_WEEK_START);
    const key = r.loc + '|' + weekKey;
    if (!byGroup[key]) byGroup[key] = {
      loc: r.loc, weekKey, weekStart: dKey(weekStartOf(d, PAY_WEEK_START)),
      needHrs: 0, actHrs: 0, schedHrs: 0, schedKnown: true, days: 0,
    };
    const g = byGroup[key];
    g.needHrs += r.needHrs || 0;
    g.actHrs += r.actHrs || 0;
    if (r.darSchedHrs == null) g.schedKnown = false;
    else g.schedHrs += r.darSchedHrs;
    g.days++;
  }
  return Object.values(byGroup).map(g => {
    const weekEnd = addD(new Date(g.weekStart + 'T00:00:00'), 6);
    const complete = weekEnd <= lastClosed;
    return {
      loc: g.loc, weekKey: g.weekKey, weekStart: g.weekStart, days: g.days, complete,
      needHrs: +g.needHrs.toFixed(2), actHrs: +g.actHrs.toFixed(2),
      schedHrs: g.schedKnown ? +g.schedHrs.toFixed(2) : null,
      planningGapHrs: g.schedKnown ? +(g.schedHrs - g.needHrs).toFixed(2) : null,
      executionGapHrs: g.schedKnown ? +(g.actHrs - g.schedHrs).toFixed(2) : null,
      combinedGapHrs: +(g.actHrs - g.needHrs).toFixed(2),
    };
  }).sort((a, b) => (a.loc === b.loc ? b.weekKey.localeCompare(a.weekKey) : a.loc.localeCompare(b.loc)));
}

/**
 * Latest COMPLETE pay week per store — the coaching-ready figure ("last week you ran N hours
 * heavy on execution"). Never returns an in-progress week whose number would still be moving.
 */
export function latestCompleteWeekByStore(splits = []) {
  const byLoc = {};
  for (const s of splits) {
    if (!s.complete) continue;
    if (!byLoc[s.loc] || s.weekKey > byLoc[s.loc].weekKey) byLoc[s.loc] = s;
  }
  return byLoc;
}

// ── Coaching threshold (Store Cockpit "Coach" box, redesigned 2026-11-05) ───────────────────
// Owner's stated rule of thumb: "In a perfect world, the schedule would run 0 hours +/-. We
// don't want to run that close but a +/- 10 hour per day has always been a good rule of thumb."
// That is a PER-DAY guideline, but computeLaborGapSplit's only grain is the pay WEEK — so the
// threshold applied to a week's planningGapHrs/executionGapHrs is the per-day guideline scaled
// by that week's own day count (hrsPerDay * days), not a hardcoded 70. Using `days` rather than
// a fixed 7 also keeps this correct if this is ever fed a partial week.
//
// Measured before picking "scale the weekly total" over "check each day individually": a live
// complete pay week across all 27 stores (2026-10-28..2026-11-03, via qsr_daily_activity_rollup)
// showed each store's daily planning/execution gaps are overwhelmingly one-signed within the
// week, not oscillating and cancelling — e.g. loc 3708's 7 execution-gap days were
// -32.7,-33.5,-51.1,-68.0,-25.3,+0.8,-33.2 hrs (one positive day, the rest negative). So
// weeklyGap/days is a faithful stand-in for "the typical day's gap" for the stores measured, not
// an average that launders real daily misses into a falsely small number. A store with genuine
// day-to-day cancellation (alternating over/under) would still read smaller here than its worst
// individual days — that's a known limit of operating at the week grain, not something this
// change fixes; a true per-day exceedance count would need a new engine entry point reading
// qsr_daily_activity_rollup day-by-day instead of this file's weekly sums.
//
// Previously this box had NO magnitude threshold at all — it just said "whichever of
// planningGapHrs/executionGapHrs is bigger in absolute value" was the coaching direction, even
// when both were a couple of hours and well inside normal week-to-week noise. That's the
// inaccuracy the owner flagged: a trivial gap still produced a confident "coach the shift
// managers" verdict. The threshold below gates that — below it, neither side is a real signal.
export const DEFAULT_LABOR_COACH_HRS_PER_DAY = 10;

/**
 * Classifies a pay week's planning/execution split against the ±hrsPerDay guideline (default
 * the owner's 10 hrs/day rule of thumb). Pure + testable in isolation from the React verdict
 * text (src/views/store-cockpit.js's LaborCockpitTab), which only turns this classification into
 * words — the actual threshold decision lives here, once.
 *
 * Returns null when either gap is unknown (schedule hours not populated) or `days` is falsy.
 * Otherwise returns:
 *   state: 'within-tolerance' | 'plan-leads' | 'exec-leads' | 'both-over-plan-leads' | 'both-over-exec-leads'
 *     - within-tolerance: neither |planGap| nor |execGap| exceeds the threshold — no coaching signal.
 *     - plan-leads / exec-leads: exactly one side exceeds the threshold (or both exceed and that
 *       side is the larger of the two) — coach toward that side.
 *     - both-over-*: BOTH sides exceed the threshold; the suffix names the larger of the two, but
 *       the caller should say both are off, not let the smaller one read as "tracks the guide."
 */
export function laborCoachVerdict({ planGap, execGap, days, hrsPerDay = DEFAULT_LABOR_COACH_HRS_PER_DAY } = {}) {
  if (planGap == null || execGap == null || !days) return null;
  const thresholdHrs = hrsPerDay * days;
  const planAbs = Math.abs(planGap), execAbs = Math.abs(execGap);
  const planOver = planAbs > thresholdHrs, execOver = execAbs > thresholdHrs;
  let state;
  if (!planOver && !execOver) state = 'within-tolerance';
  else if (planOver && execOver) state = planAbs >= execAbs ? 'both-over-plan-leads' : 'both-over-exec-leads';
  else state = planOver ? 'plan-leads' : 'exec-leads';
  return { state, planGap, execGap, planAbs, execAbs, planOver, execOver, thresholdHrs, hrsPerDay, days };
}

/** District rollup — mirrors count-cycle.js's cycleSummary / waste-discipline.js's disciplineSummary shape. */
export function laborGapSplitSummary(weekRows = []) {
  const known = weekRows.filter(w => w.planningGapHrs != null);
  const s = {
    stores: weekRows.length, storesWithSchedData: known.length,
    totalPlanningGapHrs: 0, totalExecutionGapHrs: 0, totalCombinedGapHrs: 0,
    storesOverPlanning: 0, storesOverExecution: 0,
  };
  for (const w of weekRows) {
    s.totalCombinedGapHrs += w.combinedGapHrs;
    if (w.planningGapHrs != null) {
      s.totalPlanningGapHrs += w.planningGapHrs;
      s.totalExecutionGapHrs += w.executionGapHrs;
      if (w.planningGapHrs > 0) s.storesOverPlanning++;
      if (w.executionGapHrs > 0) s.storesOverExecution++;
    }
  }
  s.totalPlanningGapHrs = +s.totalPlanningGapHrs.toFixed(1);
  s.totalExecutionGapHrs = +s.totalExecutionGapHrs.toFixed(1);
  s.totalCombinedGapHrs = +s.totalCombinedGapHrs.toFixed(1);
  return s;
}
