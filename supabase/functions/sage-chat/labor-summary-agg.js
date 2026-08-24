// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_labor_summary tool
// (dispatch #90, memory/dispatch-90.md). Imported directly by
// supabase/functions/sage-chat/index.ts and by its Vitest test in src/__tests__/, so the SAME
// code that runs in production is what the test exercises. Plain JS, no TypeScript, per repo
// convention.
//
// The bug this fixes: SAGE had no live tool for OT $/hrs or the Controls-basis "Act vs Need"
// staffing gap. Both were only available baked into the system prompt as a FIXED 60-day summary
// (src/views/sage.js buildLaborSummary/buildScheduleSummary), so a question about any OTHER
// window (e.g. "OT over the last 30 days") had no exact figure to read -- SAGE answered by
// scaling the 60-day total, which assumes OT is uniform across the window and it plainly is not.
// Measured against the owner's Controls export (2026-07-25 to 2026-08-23, 27 stores): SAGE's
// "60-day figure halved" put Madill 5th at $1,706 when the real 30-day figure is $2,711 and
// Madill is actually #1 -- the total was close (SAGE $24,752 vs actual $23,590) but the RANKING
// was wrong, which is the one thing an OT list exists to get right.
//
// This tool queries the exact requested window from the SAME authoritative auto streams the
// owner's export reads: qsr_labor_summary (over_time_total_dollars/hours -- crew/punched OT,
// matching #327's crew-only labor basis, see item 0 of dispatch #90) and
// qsr_daily_activity_rollup (actual_punched_hours - total_needed_hours -- the Controls-basis
// "Act vs Need" the export's understaffed ranking uses).
//
// Also fixes the second half of dispatch #90 (item 2): SAGE's under-staffed answer named only
// Bonifay and Sulphur, missing Seminole -- the district's actual worst store at -58h/day on the
// Controls basis. The reason isn't a threshold or a truncation bug: SAGE's ONLY prior source for
// over/under-staffing was LifeLenz's sch_vlh/need_vlh gap (query_lifelenz_labor), and on THAT
// basis Seminole reads as +1.3h/day -- essentially on target. LifeLenz and Controls disagree
// sharply, in DIRECTION as well as magnitude, for this specific store (verified live against
// Supabase during this dispatch: LifeLenz +1.3h/day vs Controls -58.2h/day for the same window).
// Giving SAGE the Controls-basis figure directly -- rather than asking it to reconcile two
// differently-calibrated sources on its own -- is the fix; see also item 3's LifeLenz-inflation
// finding (memory/finding-overscheduling-is-chaos-not-cost.md).

export function aggregateLaborSummary(otRows, rollupRows, storeNames = {}) {
  const byStore = {};
  const get = loc => (byStore[loc] ||= { otDollar: 0, otHrs: 0, otDays: 0, actVsNeedSum: 0, needDays: 0 });

  for (const row of otRows) {
    // qsr_labor_summary.loc is the same 7-char zero-padded NSN as every other qsr_* table
    // (see lifelenz-labor-agg.js's identical fix for the same class of bug).
    const loc = String(parseInt(row.loc, 10));
    const m = row.metrics || {};
    const s = get(loc);
    s.otDollar += Number(m.over_time_total_dollars) || 0;
    s.otHrs += Number(m.over_time_total_hours) || 0;
    s.otDays++;
  }

  for (const row of rollupRows) {
    if (row.actual_punched_hours == null || row.total_needed_hours == null) continue;
    const loc = String(parseInt(row.loc, 10));
    const s = get(loc);
    s.actVsNeedSum += Number(row.actual_punched_hours) - Number(row.total_needed_hours);
    s.needDays++;
  }

  return Object.entries(byStore).map(([loc, s]) => ({
    loc,
    name: storeNames[loc] || `Store ${loc}`,
    ot_dollar_total: +s.otDollar.toFixed(2),
    ot_hrs_total: +s.otHrs.toFixed(1),
    ot_days: s.otDays,
    // Signed: negative = under-staffed, positive = over-staffed. Averaged per day, NOT a window
    // total -- same "name the period" lesson as dispatch #82's gap_vlh_total/avg_daily_gap split.
    act_vs_need_avg_hrs_per_day: s.needDays ? +(s.actVsNeedSum / s.needDays).toFixed(1) : null,
    act_vs_need_days: s.needDays,
  })).sort((a, b) => b.ot_dollar_total - a.ot_dollar_total);
}

export const LABOR_SUMMARY_NOTE =
  'ot_dollar_total/ot_hrs_total = SUMMED over the exact requested date_range, from qsr_labor_summary '
  + '(crew/punched OT -- same crew-only basis as the rest of the app\'s labor %, see #327). '
  + 'act_vs_need_avg_hrs_per_day = (actual punched hours − needed hours), AVERAGED PER DAY over '
  + 'act_vs_need_days, from qsr_daily_activity_rollup -- the SAME basis as the owner\'s Controls '
  + '"Act vs Need" export. Negative = under-staffed, positive = over-staffed. '
  + 'This is a DIFFERENT, more reliable basis than query_lifelenz_labor\'s sch_vlh/need_vlh gap -- '
  + 'the two use differently-calibrated need baselines and can disagree sharply in both magnitude '
  + 'AND direction for the same store. Prefer THIS tool for OT-dollar and under/over-staffed '
  + 'questions; use query_lifelenz_labor only for VLH scheduling-specific questions.';
