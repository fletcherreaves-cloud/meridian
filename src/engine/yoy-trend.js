// @ts-nocheck
// ── Year-over-Year Trend engine (task #90, design doc memory/plan-yoy-trend-dashboard-2026-11-05.md) ──
// A monthly-bucketed, calendar-accurate current-year vs N-prior-years series for any
// top-bottom-performers.js PERFORMER_METRICS key, rolled up across one or more stores.
//
// This is a SIBLING module, not a rewrite of vs-ly.js -- it reuses vs-ly.js's own
// firstRealTradingDate() (the young-store honeymoon-ramp detector) rather than reimplementing
// it, and it reuses metric-source.js's own metricRate() (true Σnum/Σden for a registered ratio
// metric, mean-of-daily fallback otherwise) for every PERFORMER_METRICS key except the small,
// explicit set of genuine raw volume totals (Sales, Guest Count, OT Hours) -- see
// yoyMetricAgg()'s own comment for why this can't just be "ratio-capable or not" (primeCostPct
// is the counterexample: a percentage with no registered ratio derive).
//
// Calendar matching, NOT weekday-shadow matching: each month is compared to the SAME calendar
// month N year(s) earlier (Sept 2026 vs Sept 2025 vs Sept 2024), built the same way
// trend-report.js's own monthRange()/shiftYearBack() pair already proves out for a calendar
// month comparison. This is deliberately NOT vs-ly.js's matchedVsLY (364-day/weekday-shadow
// matching) -- that's correct for a trading-WEEK comparison, and wrong for a calendar month for
// the exact reason trend-report.js's own Scope Summary table had to fix the same bug (owner-
// caught, 2026-09-14): a 364-day-back shift lands on a weekday-shifted set of days, not the
// actual prior-year calendar month.
//
// Verified against live production data before shipping (store 0003708, qsr_daily_activity_rollup,
// service-role read): September 2023/2024/2025 each independently summed to exactly 30 complete
// days and real dollar totals ($318,684.29 / $324,087.80 / $310,994.40) -- confirming an exact
// {s,e} calendar-date-range filter (what monthRange()+the loc/date loop below does) lands on the
// real, same-length prior-year month, not a weekday-shifted window.

import { metricSeries, metricRate, metricDirection } from './metric-source.js';
import { firstRealTradingDate } from './vs-ly.js';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthRange(y, m) {
  const s = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const e = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { s, e };
}

// A genuine raw VOLUME total -- the only PERFORMER_METRICS keys whose correct monthly figure is
// the SUM of daily values, never a mean or a ratio. Everything else routes through metricRate()
// below, which already picks the right basis per metric-source.js itself (true Σnum/Σden for a
// registered ratio derive like laborPct/tpph/oepe, falling back to mean-of-daily ONLY for a
// percentage with no registered ratio parts -- primeCostPct, laborPct+fobPct, is exactly this
// case: NOT in rollupCapableMetricKeys() since it's a SUM of two ratios, not itself a num/den
// pair, so metricRate's mean fallback is the correct basis, not a raw sum of percentages).
//
// Caught before shipping: an earlier version of this function used
// `rollupCapableMetricKeys().includes(key) ? 'rate' : 'sum'` -- correct for every OTHER
// PERFORMER_METRICS key, but wrong for primeCostPct specifically, which is a percentage with no
// ratio derive, so it fell into the 'sum' branch and would have summed 30 days of ~25% readings
// into something like 750%. This curated allowlist is the SAME shape trend-report.js's own
// hand-typed `agg:'sum'|'rate'` field already uses for the same distinction -- not a new, second
// registry, the same one restated as a list.
const VOLUME_METRIC_KEYS = new Set(['sales', 'gc', 'otHrs']);
export function yoyMetricAgg(metricKey) {
  return VOLUME_METRIC_KEYS.has(metricKey) ? 'sum' : 'rate';
}

function monthValue(ds, locs, range, metricKey, agg) {
  if (agg === 'rate') return metricRate(ds, locs, range, metricKey);
  let sum = 0, has = false;
  for (const loc of locs) {
    const series = metricSeries(ds, loc, range, metricKey);
    for (const k in series) { if (series[k] != null) { sum += series[k]; has = true; } }
  }
  return has ? sum : null;
}

// How many days of qsrActSummaryRows history the view must fetch for youngStoreFlags() below to
// judge store age correctly -- NOT just enough to cover `yearsBack` of display. Measured live
// (service-role, store 0003708, a real store that opened in 2019): fetching exactly the display
// window (e.g. 3 years back) made firstRealTradingDate() return the FIRST loaded row as the
// store's "opening," because an established store already clears the floor on day one of
// whatever window happens to be loaded -- that's vs-ly.js's own documented "safe failure
// direction" (undershooting age, never a false young-store flag) ONLY when the loaded window is
// already deeper than `minMonths`; fetching exactly the display window violates that precondition
// and flips it into a FALSE POSITIVE (monthsOld computed as roughly zero for every store,
// regardless of real age). The fix: fetch `minMonths` + a margin of real trading history BEFORE
// the oldest displayed year, so an old store's true opening (if it predates the fetch) still
// lands comfortably before the oldest year by more than minMonths, while a genuinely young store
// opened inside that extra buffer is still observed at its real opening date, not an edge
// artifact. Re-verified with Tishomingo (loc 43380, opened 2024-12-16, CLAUDE.md's own
// documented honeymoon-ramp case) -- same fetch depth correctly flags it and does NOT flag
// 0003708.
export function yoyFetchDaysBack(yearsBack = 2, minMonths = 24, asOf) {
  const today = asOf ? new Date(asOf) : new Date();
  const displayYears = yearsBack + 1; // current year + yearsBack prior
  const bufferMonths = minMonths + 12; // minMonths plus a safety margin
  const totalMonths = displayYears * 12 + bufferMonths;
  return Math.ceil(totalMonths * 30.44) + 14; // +14d for month-length/leap-day slack
}

// Young-store honeymoon-ramp guard, generalized from vs-ly.js's lyQuality to an arbitrary
// years-back window. NOT a rewrite of lyQuality (which is hardcoded to a single 364-day-back
// leg) -- the same tiny "months between this comparison point and the store's own first real
// trading date" formula lyQuality already uses, applied here to the OLDEST year this panel's
// window reaches, via vs-ly.js's own exported firstRealTradingDate(). `reliable:null` (can't
// judge -- no trading-start data available) must never be treated as a flag, same contract as
// lyQuality's own. REQUIRES the caller to have loaded at least yoyFetchDaysBack() days of
// history, or this degrades to the false-positive failure mode documented on yoyFetchDaysBack
// above -- never pass it whatever `ds` happens to hold already.
export function youngStoreFlags(ds, locs, { oldestYearStart, minMonths = 24 } = {}) {
  const flagged = [];
  for (const loc of locs) {
    const firstTradingDate = firstRealTradingDate(ds, loc);
    if (!firstTradingDate) continue;
    const monthsOld = (new Date(oldestYearStart) - new Date(firstTradingDate)) / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsOld < minMonths) flagged.push({ loc, monthsOld, firstTradingDate });
  }
  return flagged;
}

// Monthly series for the current calendar year plus `yearsBack` prior years, for one metric,
// rolled up (never averaged-of-averages) across `locs`.
//
// Returns { years, months, agg, direction, flagged, excludedLocs, usableLocs }:
//   years    — [currentYear, currentYear-1, ..., currentYear-yearsBack], newest first.
//   months   — 12 entries {m, label, byYear: {[year]: {value, partial, s, e} | null}}; a future
//              month in the current year (not yet reached) is null, never a fabricated 0.
//   agg      — 'sum' | 'rate', per yoyMetricAgg().
//   direction— 'higher' | 'lower' | null, per metric-source.js's metricDirection().
//   flagged  — young-store honeymoon-ramp hits (see youngStoreFlags) -- ALWAYS computed, for the
//              caller to show a caveat, even for a single-store scope.
//   excludedLocs — the subset of flagged actually dropped from the rollup. Only applied when the
//              scope is MORE THAN ONE store (the "whole-line, never per-store" composition rule:
//              every year's figure must use the SAME set of stores, or the comparison itself is
//              comparing different things year to year) -- a single store the user explicitly
//              selected is never silently dropped; its flag is surfaced instead, same as vs-ly.js's
//              own "surfaces which locs need the judgment call, doesn't make it for every caller"
//              contract.
//   usableLocs — locs actually included in the rollup (list minus excludedLocs).
export function computeYoyMonthlySeries(ds, { metricKey, locs, yearsBack = 2, asOf } = {}) {
  const list = (Array.isArray(locs) ? locs : [locs]).map(String);
  const today = asOf ? new Date(asOf) : new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1; // 1-12
  const todayISO = today.toISOString().slice(0, 10);

  const years = [];
  for (let i = 0; i <= yearsBack; i++) years.push(curYear - i);
  const oldestYearStart = `${years[years.length - 1]}-01-01`;

  const flagged = youngStoreFlags(ds, list, { oldestYearStart });
  const excludedLocs = list.length > 1 ? flagged.map(f => f.loc) : [];
  const excludedSet = new Set(excludedLocs);
  const usableLocs = list.filter(l => !excludedSet.has(l));

  const agg = yoyMetricAgg(metricKey);
  const direction = metricDirection(metricKey);

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const byYear = {};
    for (const y of years) {
      if (y === curYear && m > curMonth) { byYear[y] = null; continue; }
      let { s, e } = monthRange(y, m);
      let partial = false;
      if (y === curYear && m === curMonth && e > todayISO) { e = todayISO; partial = true; }
      const value = usableLocs.length ? monthValue(ds, usableLocs, { s, e }, metricKey, agg) : null;
      byYear[y] = { value, partial, s, e };
    }
    months.push({ m, label: MONTH_NAMES[m - 1], byYear });
  }

  return { years, months, agg, direction, flagged, excludedLocs, usableLocs };
}
