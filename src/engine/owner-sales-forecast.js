// @ts-nocheck
// Owner's real sales-forecast model, ported from his manually-maintained monthly projections
// workbook (task #80, memory/finding-owner-sales-forecast-model-2026-11-04.md). Reverse-
// engineered directly from his own formulas, not re-derived or re-tuned — every dial below
// (levelWeeks, momentumDamp, momentumCap, shrinkToFleet, reviewFlagThreshold) is his own
// fitted/backtested value from the workbook's `Assumptions` tab, where he measured this exact
// shape (6-week Level + damped/capped Momentum + shrink-to-fleet) at 1.9pp mean error against a
// held-out month, beating both a naive "repeat last month" benchmark (2.21pp) and his own prior
// model (3.27pp, since retired).
//
// The whole point of this port: his raw input (13 weeks of per-store matched-day comp%) is
// already redundant with cloud data Meridian auto-pulls daily — so this is a pure compute
// module over existing data, never a new upload or manual step. The one irreducible human step
// (a bounded override on stores the model itself flags) stays exactly where it already lives:
// the Monthly Targets editor's existing click-to-edit cell.
import { matchedVsLY } from './vs-ly.js';
import { metricSeries } from './metric-source.js';
import { weekStartOf, addD } from '../utils/date.js';

export const OWNER_FORECAST_PARAMS = Object.freeze({
  levelWeeks: 6,
  momentumRecentWeeks: 2,
  momentumPriorWeeks: 4,
  momentumDamp: 0.10,
  momentumCap: 0.02,
  shrinkToFleet: 0.15,
  reviewFlagThreshold: 0.05,
  // A week needs at least this many matched days to count as a real reading, not a partial/
  // gappy week — same spirit as this repo's standing "incomplete day" guard (CLAUDE.md, the
  // 4am-business-day section), applied at weekly grain.
  minMatchedDaysPerWeek: 5,
});

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
// Mirrors his workbook's MEDIAN(-cap, raw*damp, cap) clamp idiom exactly — not Math.min/max
// chained, so it reads identically to the formula it was copied from.
function clampMedian(x, lo, hi) { return [x, lo, hi].sort((a, b) => a - b)[1]; }

// Weekly matched-day comp% for one store, oldest first, ending with the LAST FULLY CLOSED week
// before the one containing `asOf` — his own "W-1" is always a closed week, never the
// in-progress current one. `weeks` trailing weeks (default 13, matching his `Data Input` tab).
export function weeklyCompSeries(ds, loc, asOf = new Date(), weeks = 13, params = OWNER_FORECAST_PARAMS) {
  const curWeekStart = weekStartOf(asOf);
  const series = [];
  for (let i = weeks; i >= 1; i--) {
    const s = addD(curWeekStart, -7 * i);
    const e = addD(s, 6);
    const { pct, days } = matchedVsLY(ds, loc, { s, e }, 'sales');
    series.push({ weekStart: s, weekEnd: e, pct: days >= params.minMatchedDaysPerWeek ? pct : null });
  }
  return series;
}

// Level + damped/capped Momentum for one store, pre-shrinkage. `null` when there isn't a full
// Level window of real weekly readings yet — same guard his `Sales Fcst Calc` tab uses
// (`IF(COUNT(...)<6,"",...)`): no comp history deep enough to trust, don't fabricate one.
export function computeStoreForecast(weeklySeries, params = OWNER_FORECAST_PARAMS) {
  const pcts = (weeklySeries || []).map(w => w.pct).filter(v => typeof v === 'number');
  if (pcts.length < params.levelWeeks) return null;
  const level = avg(pcts.slice(-params.levelWeeks));
  const recentN = params.momentumRecentWeeks, priorN = params.momentumPriorWeeks;
  const recent = pcts.slice(-recentN);
  const prior = pcts.slice(-(recentN + priorN), -recentN);
  // Enough for Level but not for the full recent+prior Momentum window (possible right at the
  // 6-week threshold): report Level with zero Momentum rather than refusing the whole store.
  if (recent.length < recentN || prior.length < priorN) {
    return { level, rawMomentum: null, dampedMomentum: 0, storeForecast: level, reviewFlag: false };
  }
  const rawMomentum = avg(recent) - avg(prior);
  const dampedMomentum = clampMedian(rawMomentum * params.momentumDamp, -params.momentumCap, params.momentumCap);
  const storeForecast = level + dampedMomentum;
  const reviewFlag = Math.abs(rawMomentum) > params.reviewFlagThreshold;
  return { level, rawMomentum, dampedMomentum, storeForecast, reviewFlag };
}

// Shrinks every store's storeForecast 15% toward the fleet average of storeForecast — his
// workbook's $B$34 cell, computed across the SAME set of stores being forecast this pass (not
// a fixed/global fleet), so it stays correct if the comp-store roster ever changes.
export function applyFleetShrinkage(perStoreForecasts, params = OWNER_FORECAST_PARAMS) {
  const valid = Object.values(perStoreForecasts).filter(f => f && typeof f.storeForecast === 'number');
  const fleetAvgLevel = valid.length ? avg(valid.map(f => f.storeForecast)) : null;
  const out = {};
  for (const loc in perStoreForecasts) {
    const f = perStoreForecasts[loc];
    if (!f || typeof f.storeForecast !== 'number') { out[loc] = f; continue; }
    const shrinkAdj = fleetAvgLevel == null ? 0 : (fleetAvgLevel - f.storeForecast) * params.shrinkToFleet;
    out[loc] = { ...f, fleetAvgLevel, shrinkAdj, forecastComp: f.storeForecast + shrinkAdj };
  }
  return out;
}

// Σ actual sales for one store over a calendar month — the LY leg of his `H = LY*(1+AT)` chain.
// Reuses metric-source.js's own auto-first 'sales' sourcing (manual → DAR → emailed), never a
// hand-summed raw array, per this repo's standing sourcing rule.
export function monthActualSales(ds, loc, year, month) {
  const s = new Date(year, month - 1, 1);
  const e = new Date(year, month, 0);
  const series = metricSeries(ds, loc, { s, e }, 'sales');
  return Object.values(series).reduce((a, b) => a + (b || 0), 0);
}

// Full per-store sales forecast for one target month — the end-to-end port of his workbook's
// chain (weekly comp → Level/Momentum → fleet shrinkage → LY*(1+comp)). `locs`: every store to
// forecast in this pass (shrinkage needs the whole comp-store set computed together, exactly
// like his workbook's single shared fleet-average cell). `targetYear`/`targetMonth`: the month
// being forecast (e.g. the Monthly Targets period being edited). `asOf`: "today", for the
// weekly series — defaults to now, overridable for backtesting against a past date.
//
// Returns { [loc]: { level, rawMomentum, dampedMomentum, storeForecast, fleetAvgLevel,
// shrinkAdj, forecastComp, reviewFlag, lySales, forecastSales } }. `forecastSales` is null
// whenever the store lacks either a full comp history (forecastComp) or real LY sales for the
// target month — never a fabricated number standing in for "we don't know yet."
export function computeOwnerSalesForecast(ds, locs, targetYear, targetMonth, asOf = new Date()) {
  const raw = {};
  for (const loc of locs) {
    raw[loc] = computeStoreForecast(weeklyCompSeries(ds, loc, asOf));
  }
  const shrunk = applyFleetShrinkage(raw);
  const out = {};
  for (const loc of locs) {
    const f = shrunk[loc];
    const lySales = monthActualSales(ds, loc, targetYear - 1, targetMonth);
    const forecastSales = (f && typeof f.forecastComp === 'number' && lySales > 0)
      ? lySales * (1 + f.forecastComp) : null;
    out[loc] = { ...(f || {}), lySales, forecastSales };
  }
  return out;
}
