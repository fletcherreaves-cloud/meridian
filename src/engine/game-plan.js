// @ts-nocheck
// Game Plan — GM/SM/AM/DM front door (owner request 2026-11-07, following the "Four Decks"
// mockup exploration). Pure data layer only; src/views/game-plan-view.js owns rendering.
//
// Reuses the SAME shared, auto-first metric resolvers every other panel in this app uses
// (src/engine/metric-source.js's metricSeries, src/engine/vs-ly.js's autoFirstDaily) -- per
// CLAUDE.md's standing "source data through the shared helpers" rule, never a second,
// independently-derived read of ds.laborRows/ctrlRows/opsRows for a metric value.
//
// "Your week so far" deliberately covers the trailing 7 CLOSED business days ending at
// lastClosedBusinessDay(), not a Mon-Sun calendar week ending at today. CLAUDE.md's own 4am-ABC
// business-day rule flags an in-progress "today" as structurally different from a closed day
// (qsr_daily_activity_rollup zero-fills hours that haven't happened yet rather than omitting
// them) -- plotting it next to 6 closed days as if comparable is exactly the completeness trap
// that rule warns about, so it is excluded from the trend rather than shown half-filled.
import { lastClosedBusinessDay } from '../utils/date.js';
import { metricSeries } from './metric-source.js';
import { autoFirstDaily } from './vs-ly.js';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A "win" is reported only when the trailing-week vs-LY comparison is real (both sides have
// data) AND clearly positive -- never a forced celebration over a flat or negative week. The
// +3% floor matches this app's own existing "clearly ahead" framing elsewhere (e.g. AAG movers).
export const WIN_VS_LY_FLOOR_PCT = 3;

export function computeGamePlanWeek(ds, loc, asOf = new Date()) {
  const lastClosed = lastClosedBusinessDay(asOf);
  const start = new Date(lastClosed);
  start.setDate(start.getDate() - 6);
  const range = { s: start, e: lastClosed };
  const salesByDate = metricSeries(ds, loc, range, 'sales');
  const planByDate = metricSeries(ds, loc, range, 'projSales');

  // Index into each series by ITS OWN date keys only (never a separately-computed dKey()
  // against them) -- metric-source.js's internal day-keying is UTC-based (`_dk`), distinct from
  // utils/date.js's local-time dKey(), and the two can disagree near midnight. This mirrors the
  // established safe pattern every other metricSeries() caller in this codebase already uses
  // (e.g. src/views/analytics.js's `Object.keys(salesSeries).sort()` + `new Date(dk+'T12:00:00')`).
  const dateKeys = Object.keys(salesByDate).sort();
  const bars = dateKeys.map(dk => {
    const sales = salesByDate[dk];
    const plan = planByDate[dk] ?? null;
    const pct = (sales != null && plan > 0) ? (sales / plan * 100) : null;
    const d = new Date(dk + 'T12:00:00');
    return { dk, label: DOW_SHORT[d.getDay()], sales, plan, pct };
  });

  const { curByDate, lyByDate } = autoFirstDaily(ds, loc, range, 'sales');
  const curTotal = Object.values(curByDate).reduce((a, b) => a + b, 0);
  const lyTotal = Object.values(lyByDate).reduce((a, b) => a + b, 0);
  const vsLYPct = (curTotal > 0 && lyTotal > 0) ? ((curTotal - lyTotal) / lyTotal * 100) : null;

  return {
    bars, vsLYPct, curTotal, lyTotal,
    isWin: vsLYPct != null && vsLYPct >= WIN_VS_LY_FLOOR_PCT,
    rangeLabel: bars.length ? (bars[0].label + '–' + bars[bars.length - 1].label) : null,
  };
}

// Today's #1 priority + the supporting action list, from the SAME role-voice items
// buildCuratedHomeItems() already produced (src/engine/curated-home.js) -- no second ranking,
// no fabricated content. Caps at 3 real items; never pads with invented advice when fewer exist.
export function gamePlanActions(items) {
  return (items || []).slice(0, 3);
}
