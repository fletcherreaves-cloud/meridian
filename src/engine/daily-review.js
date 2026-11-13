// @ts-nocheck
// ── GM Daily Review — "answer the questions up front each day" ──────────────────────────────
// Owner spec (Notes 75, 2026-11-12 night, memory/notes-75-queue.md): a GM's actual daily routine
// is "review previous day's results" across Sales/Service/Controls/FOB, each compared vs target,
// with findings surfaced so "the manager does not have to go looking" — plus Service specifically
// calling out WHICH TIMES OF DAY drove any out-of-range read, both negative and positive.
//
// This is the first role (GM); Supervisor/OM equivalents are still pending from the owner and
// will extend this same engine (store-grain today, patch/district-grain later) rather than a
// parallel build — see that memory file's own status note.
//
// Deliberately reuses every existing source instead of re-deriving anything:
//   - metricDaily()/metricDirection() (metric-source.js) — the SAME auto-first per-day sourcing
//     and higher/lower-is-better direction every other panel in the app already trusts.
//   - autoFirstDaily() (vs-ly.js) — the SAME matched current-vs-LY logic Sales already uses
//     everywhere else (At-A-Glance, One-Pager, Rankings).
//   - getTargetsForDate() (store-dash.js) — the SAME month-aware target resolution Targets/
//     Projections already use, so this review's "vs target" can never silently disagree with
//     what a GM sees on the Projection Workspace for the identical metric.
//   - DAYPART_SLOTS (labor-standard.js) — the SAME daypart↔hour_slot boundaries DT Speed of
//     Service already uses for its own by-daypart chart.
// No new data source, no new Supabase table — pure presentation/synthesis over what already
// auto-flows in.

import { metricDaily, metricDirection } from './metric-source.js';
import { autoFirstDaily } from './vs-ly.js';
import { DAYPART_SLOTS } from './labor-standard.js';
import { lastClosedBusinessDay, dKey } from '../utils/date.js';

// ── Metric tables — one row per owner-named line item ───────────────────────────────────────
// `ms`: metric-source.js key (actual value + auto direction). `t`: DEFAULT_TARGETS field name,
// or null when the owner's own list names the line item as informational only (no target exists
// in the data model for a sales-mix %, so none is invented here).
const SALES_LINES = [
  { key: 'prodSales', label: 'Product Sales', ms: 'sales', vsLY: 'sales', unit: 'dollar' },
  { key: 'gc', label: 'Guest Count (GC)', ms: 'gc', vsLY: 'gc', unit: 'count' },
  { key: 'dtMixPct', label: 'DT % of Sales', ms: 'dtMixPct', unit: 'pct' },
  { key: 'bfMixPct', label: 'Breakfast % of Sales', ms: 'bfMixPct', unit: 'pct' },
  { key: 'mopMixPct', label: 'MOP % of Sales', ms: 'mopMixPct', unit: 'pct' },
  { key: 'kioskMixPct', label: 'Kiosk % of Sales', ms: 'kioskMixPct', unit: 'pct' },
  { key: 'delivMixPct', label: 'McDelivery % of Sales', ms: 'delivMixPct', unit: 'pct' },
  // Eat-In % of Sales: no direct metric-source key or DAR field exists for this today (dine-in
  // is implicitly "everything that isn't DT/MOP/Kiosk/McDelivery", not its own pulled number) —
  // flagged as a real gap, not computed here, rather than guessing at a derived remainder that
  // could silently be wrong if a future channel is added.
];

const SERVICE_LINES = [
  { key: 'oepe', label: 'OEPE W/O Parked', ms: 'oepe', t: 'tOepe', unit: 'sec' },
  // metric-source.js's `park` key carries no `direction` (it's a raw %, used for display
  // elsewhere, not ranking) — set explicitly here since this line DOES compare it to a target
  // and lower-parked is unambiguously better (cars served without parking).
  { key: 'park', label: 'DT Parked %', ms: 'park', dir: 'lower', t: 'tPark', unit: 'pct' },
  { key: 'r2p', label: 'R2P', ms: 'r2p', t: 'tR2p', unit: 'sec' },
  { key: 'kvst', label: 'KVS Time', ms: 'kvst', t: 'tKvst', unit: 'sec' },
  { key: 'kvsHealthy', label: '2nd Side Healthy Usage %', ms: 'kvsHealthy', t: 'tKvsu', unit: 'pct' },
];

const LABOR_LINES = [
  { key: 'laborPct', label: 'Punched Labor %', ms: 'laborPct', t: 'tLabor', unit: 'pct' },
  { key: 'actHrs', label: 'Act Hours', ms: 'actHrs', unit: 'hours' },
  { key: 'tpph', label: 'TPPH', ms: 'tpph', t: 'tTpph', unit: 'rate' },
  { key: 'otHrs', label: 'OT Hours', ms: 'otHrs', unit: 'hours' },
  { key: 'actVsSched', label: 'Act vs Scheduled', ms: 'actVsSched', unit: 'hours' },
  { key: 'actVsNeed', label: 'Act vs Needed', ms: 'actVsNeed', unit: 'hours' },
];

const CASH_LINES = [
  { key: 'cashOS', label: 'Cash +/-', ms: 'cashOSAmt', t: 'tCashOSAmt', unit: 'dollar' },
  { key: 'promoPct', label: 'Promos', ms: 'promoPct', t: 'tPromoPct', unit: 'pct' },
  { key: 'tRedAPct', label: 'T-Red Before', ms: 'tRedAPct', t: 'tRedAPct', unit: 'pct' },
  { key: 'tRedBPct', label: 'T-Red After', ms: 'tRedBPct', t: 'tRedBPct', unit: 'pct' },
  // Refund/Empl+Mgr Meal: metric-source.js has no single combined-dollar key for either (cash
  // vs cashless refunds, and employee vs manager meals, are separate chains there) — `sumMs`
  // composes the real per-leg auto-first values rather than inventing a new metric-source key
  // for one feature, the same way metric-source.js's own derive chains compose existing legs.
  { key: 'refundAmt', label: 'Refund', sumMs: ['cashRefAmt', 'cashlessRefAmt'], dir: 'lower', t: 'tRefundAmt', unit: 'dollar' },
  { key: 'posOverPct', label: 'Overring', ms: 'posOverPct', t: 'tPosOverPct', unit: 'pct' },
  { key: 'emplMgrMeal', label: 'Empl/Mgr Meal', sumMs: ['empMealAmt', 'mgrMealAmt'], unit: 'dollar' },
];

const FOB_LINES = [
  { key: 'fobPct', label: 'FOB %', ms: 'fobPct', t: 'tFOBTarget', unit: 'pct' },
  { key: 'compWaste', label: 'Comp Waste %', ms: 'compWaste', t: 'tCompWaste', unit: 'pct' },
  { key: 'rawWaste', label: 'Raw Waste %', ms: 'rawWaste', t: 'tRawWaste', unit: 'pct' },
  { key: 'condiment', label: 'Condiment %', ms: 'condiment', t: 'tCondiment', unit: 'pct' },
  { key: 'empMeal', label: 'Empl Meal %', ms: 'empMeal', t: 'tEmpFood', unit: 'pct' },
  { key: 'statVar', label: 'Stat Var %', ms: 'statVar', t: 'tStatLoss', unit: 'pct' },
  { key: 'unexplained', label: 'Unexplained %', ms: 'unexplained', t: 'tUnex', unit: 'pct' },
  { key: 'discPct', label: 'Disc Coupon %', ms: 'discPct', t: 'tDiscCoupPct', unit: 'pct' },
  // Paper Cost %: DEFAULT_TARGETS carries a real target (tPaperCost) but metric-source.js has
  // no actual-value key for it yet — the one genuine gap found while building this (everything
  // else the owner named already had both a real source AND a real target). Surfaced as a
  // target-only line (no actual) rather than silently dropped, so the gap stays visible instead
  // of invisible.
  { key: 'paperCost', label: 'Paper Cost %', ms: null, t: 'tPaperCost', unit: 'pct' },
];

const SECTIONS = [
  { key: 'sales', label: 'Sales', lines: SALES_LINES },
  { key: 'service', label: 'Service', lines: SERVICE_LINES },
  { key: 'labor', label: 'Controls — Labor', lines: LABOR_LINES },
  { key: 'cash', label: 'Controls — Cash', lines: CASH_LINES },
  { key: 'fob', label: 'FOB', lines: FOB_LINES },
];

// ── Status/severity ──────────────────────────────────────────────────────────────────────────
// One shared rule for every line item with a target: within target or better = 'good'; within
// a 10% band past target = 'watch'; worse than that = 'bad'. Matches the tolerance Visit
// Readiness and the Security rules engine already use for "how far off is concerning" — not a
// new number invented for this feature.
const WATCH_BAND = 0.10;

function statusFor(actual, target, direction) {
  if (actual == null || target == null || !Number.isFinite(target) || target === 0) return null;
  const better = direction === 'lower' ? actual <= target : actual >= target;
  if (better) return 'good';
  const offPct = Math.abs(actual - target) / Math.abs(target);
  return offPct <= WATCH_BAND ? 'watch' : 'bad';
}

const SEV_RANK = { bad: 2, watch: 1, good: 0 };

function buildLine(ds, loc, date, targets, def) {
  let actual = null;
  if (def.ms) actual = metricDaily(ds, loc, date, def.ms);
  else if (def.sumMs) {
    const vals = def.sumMs.map(k => metricDaily(ds, loc, date, k));
    actual = vals.every(v => v == null) ? null : vals.reduce((a, v) => a + (v || 0), 0);
  }
  const direction = def.dir || (def.ms ? metricDirection(def.ms) : 'lower');
  const target = def.t ? targets?.[def.t] : null;
  const status = def.t ? statusFor(actual, target, direction) : null;
  const line = { key: def.key, label: def.label, unit: def.unit, actual, target, direction, status };
  if (def.vsLY) {
    const { curByDate, lyByDate } = autoFirstDaily(ds, loc, { s: date, e: date }, def.vsLY);
    const dk = dKey(date);
    const cur = curByDate[dk], ly = lyByDate[dk];
    line.actual = cur ?? line.actual;
    line.ly = ly ?? null;
    line.vsLYPct = (cur != null && ly > 0) ? (cur - ly) / ly : null;
  }
  return line;
}

function sectionSeverity(lines) {
  const statuses = lines.map(l => l.status).filter(Boolean);
  if (!statuses.length) return null;
  return statuses.reduce((worst, s) => (SEV_RANK[s] > SEV_RANK[worst] ? s : worst), 'good');
}

/**
 * The GM Daily Review for one store, one business day. Pure/synchronous — reads only from the
 * already-loaded `ds` datastore every other panel receives, the same auto-first metric sourcing
 * everything else in the app uses. No network calls (see buildServiceDaypartBreakdown below for
 * the one piece that needs its own raw-hourly fetch).
 */
export function buildDailyReview(ds, loc, date = lastClosedBusinessDay(), targets = null) {
  const sections = SECTIONS.map(sec => {
    const lines = sec.lines.map(def => buildLine(ds, loc, date, targets, def));
    return { key: sec.key, label: sec.label, lines, severity: sectionSeverity(lines) };
  });
  return { loc: String(loc), date: dKey(date), sections };
}

// ── Service daypart breakdown — "point out the times of day that were the issue" ───────────────
// Needs raw hourly qsr_daily_activity rows (loadDtHistory in lib/supabase.js), which is a network
// call, so this stays a separate pure function the panel feeds after its own fetch — same split
// dt-speedofservice.js already uses between data-loading (component effect) and aggregation
// (plain functions). `rows`: loadDtHistory({s:date,e:date}) result, unfiltered by loc.
const DAYPART_LIST = [
  { id: 'breakfast', label: 'Breakfast', hours: DAYPART_SLOTS['Breakfast'] },
  { id: 'lunch', label: 'Lunch', hours: DAYPART_SLOTS['Lunch'] },
  { id: 'pm', label: 'Afternoon', hours: DAYPART_SLOTS['Afternoon'] },
  { id: 'dinner', label: 'Dinner', hours: DAYPART_SLOTS['Dinner'] },
  { id: 'late', label: 'Late Night', hours: DAYPART_SLOTS['Late Night'] },
];

// us/cnt field pairs per service line — mirrors dt-speedofservice.js's STATION_FIELDS for DT,
// extended to FC (R2P) and Kitchen (KVS) since this review covers all three, not just DT.
const DAYPART_FIELDS = {
  oepe: { us: ['dt_untilserve'], cnt: ['dt_trans_cnt'], store: ['dt_untilstore'], held: ['dt_heldtime'] },
  r2p: { us: ['fc_untilserve', 'fc_untilcloseddrawer'], cnt: ['fc_trans_cnt'], sub: true },
  kvst: { us: ['mfy_time'], cnt: ['mfy_trans_cnt'] },
};

function daypartAvgFor(rows, loc, date, key) {
  const L = String(parseInt(loc, 10));
  const dk = dKey(date);
  const fields = DAYPART_FIELDS[key];
  if (!fields) return [];
  const byHour = {};
  for (const r of rows) {
    if (String(parseInt(r.loc, 10)) !== L) continue;
    if (dKey(r.dt || r.date) !== dk) continue;
    const slot = r.hour_slot;
    if (!byHour[slot]) byHour[slot] = { us: 0, cnt: 0 };
    const h = byHour[slot];
    if (fields.sub) h.us += (r[fields.us[0]] || 0) - (r[fields.us[1]] || 0);
    else for (const f of fields.us) h.us += r[f] || 0;
    for (const f of fields.cnt) h.cnt += r[f] || 0;
  }
  return DAYPART_LIST.map(dp => {
    const matching = dp.hours.map(h => byHour[h]).filter(h => h && h.cnt > 0);
    const totalUs = matching.reduce((a, h) => a + h.us, 0);
    const totalCnt = matching.reduce((a, h) => a + h.cnt, 0);
    return { ...dp, avgSec: totalCnt > 0 ? totalUs / totalCnt : null, trans: totalCnt };
  }).filter(d => d.avgSec != null);
}

/**
 * For each service line that has a daypart-capable source (OEPE/R2P/KVST), the per-daypart avg
 * seconds + which daypart(s) ran best/worst vs the store's own daily average — the "literally
 * point out the times of day" ask. Park %/KVS Healthy % have no per-hour-slot field in the raw
 * DAR rows the way time-based metrics do, so they're correctly absent here, not a gap.
 */
export function buildServiceDaypartBreakdown(rows, loc, date) {
  return ['oepe', 'r2p', 'kvst'].map(key => {
    const dayparts = daypartAvgFor(rows || [], loc, date, key);
    if (!dayparts.length) return { key, dayparts: [] };
    const overallAvg = dayparts.reduce((a, d) => a + d.avgSec * d.trans, 0) /
      Math.max(1, dayparts.reduce((a, d) => a + d.trans, 0));
    const best = dayparts.reduce((a, d) => (d.avgSec < a.avgSec ? d : a));
    const worst = dayparts.reduce((a, d) => (d.avgSec > a.avgSec ? d : a));
    return { key, dayparts, overallAvg, best, worst };
  }).filter(d => d.dayparts.length);
}
