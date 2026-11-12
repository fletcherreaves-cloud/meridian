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

// ruleId -> real panel-registry id (src/app/panel-registry.js). Every one of MORNING_RULES' 12
// rule ids (src/features/morning-brief.js) is covered -- checked against the real registry, not
// guessed. Lives here (not in curated-home.js or game-plan-view.js) so BOTH of those view files
// can import it without a circular dependency (curated-home.js already imports GamePlanFormat
// from game-plan-view.js; game-plan-view.js needing the same map back from curated-home.js would
// create one).
export const RULE_PANEL = {
  DRAWER_OPENS: 'security', REFUND_OVERRING: 'security', TRED_SPIKE: 'security',
  GC_SALES_DIVERGE: 'security', CASH_OS: 'security',
  FOOD_COST_HIGH: 'fob-analysis',
  STAFFED_SLOW: 'dt-sos', STAFFED_NO_PARK: 'dt-sos', TIMER_GAMING: 'dt-sos',
  KVS_USAGE_LOW: 'dt-sos', DAYPART_OEPE: 'dt-sos',
  SMG_OSAT_LOW: 'smg-voice',
};
export const RULE_PANEL_LABEL = {
  security: 'Security', 'fob-analysis': 'Food Cost', 'dt-sos': 'DT Speed of Service', 'smg-voice': 'Guest Voice',
};

// A "win" is reported only when the trailing-week vs-LY comparison is real (both sides have
// data) AND clearly positive -- never a forced celebration over a flat or negative week. The
// +3% floor matches this app's own existing "clearly ahead" framing elsewhere (e.g. AAG movers).
export const WIN_VS_LY_FLOOR_PCT = 3;

// How far back the "not enough of a week yet" fallback looks (owner feedback 2026-11-11:
// "that would imply a day or two of Nothing to show yet... Maybe a rolling monthly or last 7
// days") -- a new store onboarding, or any store with a genuine gap in its trailing week, still
// gets a real number instead of a blank card for however long that gap lasts.
const FALLBACK_LOOKBACK_DAYS = 30;

function closedDayRange(lastClosed, daysBack) {
  const start = new Date(lastClosed);
  start.setDate(start.getDate() - daysBack);
  return { s: start, e: lastClosed };
}

export function computeGamePlanWeek(ds, loc, asOf = new Date()) {
  const lastClosed = lastClosedBusinessDay(asOf);
  const range = closedDayRange(lastClosed, 6);
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

  const result = {
    bars, vsLYPct, curTotal, lyTotal,
    isWin: vsLYPct != null && vsLYPct >= WIN_VS_LY_FLOOR_PCT,
    rangeLabel: bars.length ? (bars[0].label + '–' + bars[bars.length - 1].label) : null,
    fallback: null,
  };
  if (bars.length > 0) return result;

  // Nothing in the trailing week -- widen the lookback and report ONE honest rollup number
  // instead of a blank card (or squeezing 30 tiny bars into a 7-bar-wide layout). Same shared
  // metricSeries() helper, just a longer window; still real-or-nothing (if even THIS comes back
  // empty, the store genuinely has no sales on file yet and the plain empty state stands).
  const wideRange = closedDayRange(lastClosed, FALLBACK_LOOKBACK_DAYS - 1);
  const wideSales = metricSeries(ds, loc, wideRange, 'sales');
  const wideDays = Object.keys(wideSales);
  if (!wideDays.length) return result;
  const widePlan = metricSeries(ds, loc, wideRange, 'projSales');
  const totalSales = wideDays.reduce((a, dk) => a + (wideSales[dk] || 0), 0);
  const totalPlan = Object.keys(widePlan).reduce((a, dk) => a + (widePlan[dk] || 0), 0);
  result.fallback = { days: wideDays.length, totalSales, pct: totalPlan > 0 ? (totalSales / totalPlan * 100) : null };
  return result;
}

// Today's #1 priority + the supporting action list, from the SAME role-voice items
// buildCuratedHomeItems() already produced (src/engine/curated-home.js) -- no second ranking,
// no fabricated content. Caps at 3 real items; never pads with invented advice when fewer exist.
export function gamePlanActions(items) {
  return (items || []).slice(0, 3);
}
