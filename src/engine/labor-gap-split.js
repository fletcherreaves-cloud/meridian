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
