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

import { metricDaily, metricDirection, metricSeries, metricRate } from './metric-source.js';
import { autoFirstDaily, matchedVsLY } from './vs-ly.js';
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

// ── Today's Win — "find at least one positive thing to call out, every store, every day" ──────
// Owner, 2026-11-13 (prompted by the Why Engine remedy work): "for each location we need to
// find somewhere to find at least one positive thing to call for each day." Deliberately reuses
// buildDailyReview()'s own already-computed lines rather than a parallel positives engine — a
// "win" is just the single best-performing real number this review already has, ranked by how
// far past target it actually is, never invented praise. Honesty rule mirrors the remedy work's
// own: every win cites a real figure, and a day with no standout beat says so plainly instead
// of manufacturing one.
const WIN_LY_MIN_MARGIN = 0.03; // sales/GC must beat LY by at least 3% to be headline-worthy
const WIN_TARGET_MIN_MARGIN = 0.05; // a targeted line must beat target by at least 5% of target

const WIN_SECTION_ICON = { sales: '💰', service: '⏱️', labor: '👥', cash: '💵', fob: '🥗' };

function marginBeyondTarget(line) {
  if (line.actual == null || line.target == null || !line.target) return null;
  const diff = line.direction === 'lower' ? (line.target - line.actual) : (line.actual - line.target);
  return diff / Math.abs(line.target);
}

/**
 * Finds the single best real positive in an already-built `buildDailyReview()` result. Always
 * returns a real object (never null) — if nothing clears the "genuinely notable" bar, it falls
 * back to an honest "clean day" or "no standout yet" read rather than inventing a win.
 */
export function findDailyWin(review) {
  const candidates = [];

  const sales = review.sections.find(s => s.key === 'sales');
  const prodSales = sales?.lines.find(l => l.key === 'prodSales');
  const gc = sales?.lines.find(l => l.key === 'gc');
  if (prodSales?.vsLYPct != null && prodSales.vsLYPct >= WIN_LY_MIN_MARGIN) {
    candidates.push({ margin: prodSales.vsLYPct, icon: '💰',
      headline: 'Sales up ' + (prodSales.vsLYPct * 100).toFixed(1) + '% vs LY',
      detail: '$' + Math.round(prodSales.actual).toLocaleString() + ' vs $' + Math.round(prodSales.ly).toLocaleString() + ' last year' });
  }
  if (gc?.vsLYPct != null && gc.vsLYPct >= WIN_LY_MIN_MARGIN) {
    candidates.push({ margin: gc.vsLYPct, icon: '🚶',
      headline: 'Guest counts up ' + (gc.vsLYPct * 100).toFixed(1) + '% vs LY',
      detail: Math.round(gc.actual).toLocaleString() + ' guests vs ' + Math.round(gc.ly).toLocaleString() + ' last year' });
  }

  for (const sec of review.sections) {
    if (sec.key === 'sales') continue; // already covered via vsLY above, not a target beat
    for (const line of sec.lines) {
      if (line.status !== 'good') continue;
      const margin = marginBeyondTarget(line);
      if (margin == null || margin < WIN_TARGET_MIN_MARGIN) continue;
      candidates.push({ margin, icon: WIN_SECTION_ICON[sec.key] || '✓',
        headline: line.label + ' beat target by ' + (margin * 100).toFixed(1) + '%',
        detail: sec.label + ' — real number, not just "within range"' });
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.margin - a.margin);
    const best = candidates[0];
    return { headline: best.headline, detail: best.detail, icon: best.icon, kind: 'win' };
  }

  const anyConcern = review.sections.some(s => s.severity === 'bad' || s.severity === 'watch');
  if (!anyConcern) {
    return { headline: 'Clean, steady day', icon: '✅', kind: 'clean',
      detail: 'Nothing flagged across sales, service, labor, cash, or food cost — held at or inside target all day.' };
  }

  return { headline: 'No standout yet', icon: '—', kind: 'none',
    detail: 'Nothing cleared the bar for a headline win today — check back once today’s data is fully in, or look for one in the lines above.' };
}

// ── Patch-level rollup (Area Supervisor / OM) ───────────────────────────────────────────────────
// Owner spec, memory/plan-role-based-panel-gating-2026-11-03.md §6 (2026-11-13 night, the
// Supervisor/OM notes this file's own header flagged as "still pending"): "largely the same
// review as a GM's, but across all assigned locations, with the purpose of identifying every
// hotspot... Supervisor and OM levels especially should also see WTD and MTD." Additive only —
// does not touch buildLine/buildDailyReview above, so the GM store-grain path is byte-identical
// to before this was added (see dispatch-daily-review-patch-rollup-2026-11-13.test.js).
//
// Reuses the SAME SECTIONS/line definitions (one spec, not a parallel metric list) and the SAME
// house rules for rollup math: a dollar/hours/count line is a true SUM across stores and days
// (sumMetric below); a rate/% line goes through metricRate (Σ/Σ sum-ratio first, mean-of-daily
// only as fallback — never a mean of per-store percentages, never an in-progress day blended in
// at full weight); Sales/GC vs LY goes through vs-ly.js's own matchedVsLY, which already does the
// matched-day, multi-loc sum the single-store path gets from autoFirstDaily.

function sumMetric(ds, locs, range, key) {
  const list = Array.isArray(locs) ? locs : [locs];
  let sum = 0, any = false;
  for (const loc of list) {
    const series = metricSeries(ds, loc, range, key);
    for (const k in series) { sum += series[k] || 0; any = true; }
  }
  return any ? sum : null;
}

// Totals (dollars/hours/counts) sum across the patch; everything else is a rate/% that must go
// through metricRate's Sum/Sum, never averaged as if it were already a total.
const TOTAL_UNITS = new Set(['dollar', 'count', 'hours']);

function buildPatchLine(ds, locs, range, targetsByLoc, def) {
  let actual = null, ly = null, vsLYPct = null;
  if (def.vsLY) {
    const r = matchedVsLY(ds, locs, range, def.vsLY);
    actual = r.days ? r.cur : null;
    ly = r.days ? r.ly : null;
    vsLYPct = r.pct;
  } else if (def.ms) {
    actual = TOTAL_UNITS.has(def.unit) ? sumMetric(ds, locs, range, def.ms) : metricRate(ds, locs, range, def.ms);
  } else if (def.sumMs) {
    const vals = def.sumMs.map(k => sumMetric(ds, locs, range, k));
    actual = vals.every(v => v == null) ? null : vals.reduce((a, v) => a + (v || 0), 0);
  }
  const direction = def.dir || (def.ms ? metricDirection(def.ms) : 'lower');
  let target = null;
  if (def.t) {
    const list = Array.isArray(locs) ? locs : [locs];
    // Most targets are uniform system-wide (DEFAULT_TARGETS); averaging is a no-op in that common
    // case and still a reasonable patch-level figure when a store carries its own override,
    // rather than arbitrarily picking one store's target to represent the whole patch.
    const vals = list.map(loc => targetsByLoc?.[loc]?.[def.t]).filter(v => v != null && Number.isFinite(v));
    target = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  }
  const status = def.t ? statusFor(actual, target, direction) : null;
  const line = { key: def.key, label: def.label, unit: def.unit, actual, target, direction, status };
  if (def.vsLY) { line.ly = ly; line.vsLYPct = vsLYPct; }
  return line;
}

/**
 * The Supervisor/OM Daily Review for a PATCH (a list of stores) over an arbitrary date range —
 * same section/line shape buildDailyReview returns for one store, so every existing render
 * component (SectionCard, Scorecard, LineRow) works unchanged against either. `targetsByLoc`:
 * {loc: targetsObject}, one resolved getTargetsForDate() result per store (the caller's job, same
 * as buildDailyReview's own `targets` param).
 */
export function buildPatchDailyReview(ds, locs, range, targetsByLoc = {}) {
  const list = (locs || []).map(String);
  const sections = SECTIONS.map(sec => {
    const lines = sec.lines.map(def => buildPatchLine(ds, list, range, targetsByLoc, def));
    return { key: sec.key, label: sec.label, lines, severity: sectionSeverity(lines) };
  });
  return { locs: list, range: { s: dKey(range.s), e: dKey(range.e) }, sections };
}

/**
 * Per-store severity ranking across a patch for ONE business day — "identify every hotspot...
 * enough detail to keep teams grounded in continuous operational improvement" (owner's own
 * framing for what a Supervisor's review should do). Reuses buildDailyReview() verbatim per
 * store (never a parallel per-store calculation) and ranks worst-first, so a Supervisor/OM sees
 * which stores need attention without opening every store's full review one at a time.
 */
export function buildPatchHotspots(ds, locs, date, targetsByLoc = {}) {
  const list = (locs || []).map(String);
  return list.map(loc => {
    const review = buildDailyReview(ds, loc, date, targetsByLoc[loc] || null);
    const bad = review.sections.filter(s => s.severity === 'bad').length;
    const watch = review.sections.filter(s => s.severity === 'watch').length;
    const worst = review.sections.reduce((w, s) => (SEV_RANK[s.severity || 'good'] > SEV_RANK[w] ? (s.severity || 'good') : w), 'good');
    return { loc, review, bad, watch, worst };
  }).sort((a, b) => (SEV_RANK[b.worst] - SEV_RANK[a.worst]) || (b.bad - a.bad) || (b.watch - a.watch));
}
