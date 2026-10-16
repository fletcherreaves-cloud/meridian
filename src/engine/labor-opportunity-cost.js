// @ts-nocheck
// ── Labor Opportunity Cost report (Reports redesign Phase 5, 2026-10-16) ────────────────────
// The 15 labor fields Phase 1's catalog audit gave real registry labels to (otDollar,
// actVsNeed, oppCostDollar, actVsSched, actVsSchedOpp, spph, and more) are resolvable one at a
// time through the Custom Report Builder, but nobody has built the NARRATIVE version: "$X total
// was left on the table this period, broken into overstaffing vs. understaffing vs. OT" — the
// same say-the-number-and-the-decision treatment Visit Readiness already gets.
//
// The three $ fields below (otDollar, oppCostDollar, actVsSchedOpp) are PERIOD TOTALS — "how
// much did this cost us over the whole range" is the natural question for a $ figure this
// report is about, so each is summed across the range's own daily values via
// metricRowsForRange, not averaged. otDollar already carries aggregate:'sum' in the registry
// (metricValueForRange would sum it too); oppCostDollar/actVsSchedOpp don't (their registry
// entry is a signed per-day $ figure, used by the Scanner as a daily point, not a running
// total) — summing their real daily values ourselves for THIS report's purpose is the same
// arithmetic a aggregate:'sum' flag would produce, just applied where the registry's own
// convention doesn't already do it. The two hour-gap fields (actVsNeed, actVsSched) and spph
// stay as the registry's own period AVERAGE (metricValueForRange's default) — "average daily
// hours gap" and "average $/person-hour" are the natural period figures for a rate, not a sum
// of hours that would double-count the same staffing gap every day it persisted.
// ⚠️ oppCostDollar/avgRate/actVsSchedOpp/spph are all metric-source.js DERIVE-ONLY chains (no
// `srcs` of their own at all — confirmed by reading metric-source.js directly, same check that
// caught fobPct's identical shape in controls-food-cost-link.js). metricRowsForRange always
// resolves unscoped (scopeLoc=null) then filters by loc afterward, so for a pure-derive metric
// the ONLY way that unscoped resolution can discover which locs exist is `ds.storeIds` — the
// real app always populates it (App.js's rawStores()), but a test fixture that forgets it
// silently resolves these four metrics to nothing. Caught writing this report's own panel
// test; documented here so the next report built on this pattern doesn't lose the same hour.
import { metricValueForRange, metricRowsForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

function sumMetric(key, ds, loc, start, end) {
  const rows = metricRowsForRange(key, ds, { loc, start, end });
  return rows.length ? rows.reduce((s, r) => s + r.value, 0) : null;
}

export const LABOR_OPP_COLUMNS = [
  { key: 'otDollarTotal', label: 'OT $ (Total)', unit: '$' },
  { key: 'oppCostDollarTotal', label: 'Opportunity Cost $ (Total, signed)', unit: '$' },
  { key: 'actVsSchedOppTotal', label: 'Act-vs-Sched Opportunity $ (Total, signed)', unit: '$' },
  { key: 'actVsNeedAvgHrs', label: 'Act vs Needed Hrs (Avg/day, signed)', unit: 'hrs' },
  { key: 'actVsSchedAvgHrs', label: 'Act vs Sched Hrs (Avg/day, signed)', unit: 'hrs' },
  { key: 'spphAvg', label: 'Sales/Person-Hr (Avg)', unit: '$/hr' },
];

export function buildLaborOpportunityCostReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  return targetLocs.map(loc => ({
    loc, name: STORE_NAMES[loc] || loc,
    otDollarTotal: metricValueForRange('otDollar', ds, { loc, start: range.s, end: range.e }),
    oppCostDollarTotal: sumMetric('oppCostDollar', ds, loc, range.s, range.e),
    actVsSchedOppTotal: sumMetric('actVsSchedOpp', ds, loc, range.s, range.e),
    actVsNeedAvgHrs: metricValueForRange('actVsNeed', ds, { loc, start: range.s, end: range.e }),
    actVsSchedAvgHrs: metricValueForRange('actVsSched', ds, { loc, start: range.s, end: range.e }),
    spphAvg: metricValueForRange('spph', ds, { loc, start: range.s, end: range.e }),
  }));
}
