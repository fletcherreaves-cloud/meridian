// @ts-nocheck
// ── Controls ↔ Food Cost Linkage report (Reports redesign Phase 5, 2026-10-16) ───────────────
// Owner's own unbuilt ask (memory/project-backlog.md, 2026-08-31): "at some point we have to
// link cash controls to food cost and report that as well." Two real data families already
// exist but have never been shown side by side: the FOB-reported monthly food-cost ratios
// (ds.fobRows, signal-registry.js's food_cost category) and the Controls-recorded daily meal/
// deposit facts (ds.ctrlRows/glimpseRows, the controls category's empMealAmt/mgrMealAmt/
// depositAmt/empMealCnt/mgrMealCnt — added to the registry under Phase 1's catalog audit but
// never surfaced in a report; Loss Prevention Summary, Phase 2's report, covers the OTHER
// controls fields (discount/promo/cash-O-S/refunds/overrides/T-Reds) but not these).
//
// FOB is reported monthly; Controls is daily. Resolved to whole calendar MONTHS covering the
// selected range (same "resolve the pick to its natural calendar bucket" convention Weekly
// Count Status already established) so both families line up on the real period FOB actually
// reports for, rather than an arbitrary partial-month slice. Every value still goes through
// signal-registry.js's metricValueForRange() — no second resolution path.
import { metricValueForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

export const FOOD_COST_METRICS = [
  { key: 'fobPct',      label: 'FOB %',          unit: 'pct' },
  { key: 'compWaste',   label: 'Comp Waste %',   unit: 'pct' },
  { key: 'rawWaste',    label: 'Raw Waste %',    unit: 'pct' },
  { key: 'condiment',   label: 'Condiment %',    unit: 'pct' },
  { key: 'empMeal',     label: 'Emp Meal % (FOB-reported)', unit: 'pct' },
  { key: 'statVar',     label: 'Stat Variance %', unit: 'pct' },
  { key: 'unexplained', label: 'Unexplained Diff %', unit: 'pct' },
];

export const CONTROLS_LINK_METRICS = [
  { key: 'empMealAmt', label: 'Employee Meal ($, Controls)', unit: '$' },
  { key: 'empMealCnt', label: 'Employee Meal (count)', unit: 'count' },
  { key: 'mgrMealAmt', label: 'Manager Meal ($)', unit: '$' },
  { key: 'mgrMealCnt', label: 'Manager Meal (count)', unit: 'count' },
  { key: 'depositAmt', label: 'Deposit ($)', unit: '$' },
  { key: 'discPct',    label: 'Discount %', unit: 'pct' },
  { key: 'discAmt',    label: 'Discount ($)', unit: '$' },
];

export const CONTROLS_FOOD_COST_METRICS = [...FOOD_COST_METRICS, ...CONTROLS_LINK_METRICS];

/** 'YYYY-MM-DD' -> {s,e} covering that date's whole calendar month. */
function monthBounds(key) {
  const [y, m] = key.split('-').map(Number); // m is 1-indexed (01-12)
  const lastDay = new Date(y, m, 0).getDate();
  return { s: `${key}-01`, e: `${key}-${String(lastDay).padStart(2, '0')}` };
}

/** Every 'YYYY-MM' month that overlaps [startStr, endStr] (both 'YYYY-MM-DD'), ascending. */
export function monthsInRange(startStr, endStr) {
  if (!startStr || !endStr) return [];
  const out = [];
  let cur = startStr.slice(0, 7);
  const endMonth = endStr.slice(0, 7);
  let guard = 0;
  while (cur <= endMonth && guard++ < 1200) { // 100 years' worth of months — a sane runaway guard, not a real limit
    out.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = new Date(y, m, 1).toISOString().slice(0, 7); // m (1-indexed) as the 0-indexed param is next month's first day
  }
  return out;
}

/**
 * One row per (store, calendar month covering the range) — FOB's monthly ratios alongside
 * Controls' daily-summed meal/deposit/discount facts for that same real month. A metric with
 * no data for that store-month resolves to its own null (metricValueForRange's own contract),
 * not a crash or a silently-dropped row — a blank cell is a real "not reported yet" fact here.
 */
export function buildControlsFoodCostReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  const months = monthsInRange(range.s, range.e);
  const rows = [];
  for (const loc of targetLocs) {
    for (const mk of months) {
      const { s, e } = monthBounds(mk);
      const row = { loc, name: STORE_NAMES[loc] || loc, month: mk };
      for (const m of CONTROLS_FOOD_COST_METRICS) {
        row[m.key] = metricValueForRange(m.key, ds, { loc, start: s, end: e });
      }
      rows.push(row);
    }
  }
  return rows;
}
