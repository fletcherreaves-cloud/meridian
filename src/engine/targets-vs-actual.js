// @ts-nocheck
// ── Targets vs Actual report engine ──────────────────────────────────────────────────────────
// Owner request (2026-11-15): "a new report that focuses solely on the monthly targets and
// daily targets (separate tabs) that shows clearly what the current target is vs the actual
// results." Every actual-value resolution here reuses an existing, already-proven resolver --
// never re-derives metric-source's auto-first logic or fob-reference.js's FOB-leg delta math
// (that file's own header explains why qsr_fob's cumulative MTD snapshot can't be averaged
// directly; getting it wrong silently understates every food-cost %).
import { DEFAULT_TARGETS } from '../constants.js';
import { metricAvg, metricSumRatio } from './metric-source.js';
import { autoFirstTotal } from './vs-ly.js';
import { resolveMetricForRange, FOB_REFERENCE_METRICS } from './fob-reference.js';
import { resolveLaborTarget } from './labor-basis.js';

const _normLoc = l => String(parseInt(String(l || '').replace(/\D/g, ''), 10) || '');

// Effective monthly target for a store in a given 'YYYY-M' month — the same precedence every
// other monthly-target consumer uses (App.js's mergedTargets): a real monthly_targets override
// (if one exists for that store/month) wins field-by-field; DEFAULT_TARGETS fills the rest.
// Deliberately does NOT read the device-local localStorage v2 override (loadTargetsV2) — this
// is a REPORT reading the cloud source of truth (CLAUDE.md's cloud-first rule), not the live
// editing surface, so a stale local draft on one device never makes this report disagree with
// what another device/user sees for the same store/month.
export function effectiveMonthlyTarget(loc, ym, allMonthlyTargets) {
  const L = _normLoc(loc);
  const override = (allMonthlyTargets && allMonthlyTargets[ym] && allMonthlyTargets[ym][L]) || {};
  return { ...DEFAULT_TARGETS[L], ...override };
}

// Month-end pace projection (owner request 2026-11-15: "for the sales target can you come up
// with a way to pace it based on what the actual is MTD vs projected"). Not a new method --
// this is the exact linear run-rate the live Projection Workspace's "Actuals vs Target" pace
// table already uses (analytics.js's CurrentMonthPaceSection: frac = dayOfMonth/daysInMonth;
// pace = actual/frac), so a store's pace here never disagrees with what that panel already
// shows for the same month. Only meaningful for a window whose END falls inside the target
// month (an MTD-style partial month) -- a window that's a complete prior month (or doesn't
// land in the target month at all) is already a finished total, not a partial one to project
// forward, so this returns null rather than silently "pacing" a number that needs no pacing.
export function monthEndPace(actual, rangeEndIso, targetMonthYm) {
  if (actual == null || !rangeEndIso || !targetMonthYm) return null;
  const [y, m] = String(targetMonthYm).split('-').map(Number);
  if (!y || !m) return null;
  const endDate = new Date(rangeEndIso + 'T12:00:00');
  if (endDate.getFullYear() !== y || endDate.getMonth() + 1 !== m) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  const frac = endDate.getDate() / daysInMonth;
  return frac > 0 ? actual / frac : null;
}

const _pad2 = n => String(n).padStart(2, '0');
const _isoDate = d => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;

// Year-to-date Sales $ for the Yearly tab (owner request 2026-11-15: "Add the monthly actuals
// together [to] generate the yearly actual ... for completed months and pace for any current
// month"). Sums each COMPLETED month's real monthly total (Jan .. the month before `asOf`'s
// month) plus a month-end PACE projection (monthEndPace, above) for the one month `asOf` falls
// in -- never a flat autoFirstTotal over the whole Jan-asOf span, which would just report
// whatever has happened so far and silently undercount an in-progress year by exactly the
// amount pacing exists to fix. Deliberately does NOT also project the remaining MONTHS of the
// year (unlike monthEndPace's own day-of-month fraction) -- extrapolating an entire year from a
// handful of real months is a far noisier guess than finishing out the one month already in
// progress, so every month besides the current one is either a real total or not yet counted.
// Returns { real, paced }: `real` is the honest sum of what's actually posted so far (every
// completed month's real total + the current month's real MTD-so-far, no projection) — the same
// "nothing hidden" number the Monthly tab's own `actual` field carries; `paced` additionally
// completes the current in-progress month's pace projection on top of that. A caller grades
// status off `paced` (the number that actually answers "are we on track for the year") while
// still showing `real` as the honest supporting figure, exactly like the Monthly tab's Sales $.
function _yearlySalesRollup(ds, loc, targetYear, asOf) {
  let real = 0, paced = 0, any = false;
  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(targetYear, m - 1, 1);
    if (monthStart > asOf) break; // this month and every later one haven't started yet
    const isCurrentMonth = asOf.getFullYear() === targetYear && asOf.getMonth() + 1 === m;
    const monthEndDate = isCurrentMonth ? asOf : new Date(targetYear, m, 0);
    const monthRange = { s: monthStart, e: monthEndDate };
    const monthActual = autoFirstTotal(ds, loc, monthRange, 'sales');
    if (!(monthActual > 0)) continue;
    any = true;
    real += monthActual;
    if (isCurrentMonth) {
      const monthPace = monthEndPace(monthActual, _isoDate(monthEndDate), `${targetYear}-${m}`);
      paced += monthPace != null ? monthPace : monthActual;
    } else {
      paced += monthActual;
    }
  }
  return any ? { real, paced } : { real: null, paced: null };
}

// kind -> unit, straight from FOB_REFERENCE_METRICS so this file can never disagree with that
// one on how a shared metric displays.
const _KIND_TO_UNIT = { pct: 'pct', dollar: 'dollar', rate: 'rate' };

// The FOB-leg metrics the monthly_targets table (and MonthlyTargetManager) actually track,
// mapped onto their corresponding FOB_REFERENCE_METRICS key + monthly_targets field name.
// Reuses that file's own `unit`/`better` so the two reports never drift on direction.
const _FOB_LEG_MAP = [
  { fobRefKey: 'baseFoodPct',      targetField: 'tFOBBase',   label: 'Base Food %' },
  { fobRefKey: 'discCouponPct',    targetField: 'tDiscCoupPct', label: 'Disc Coupon %' },
  { fobRefKey: 'compWastePct',     targetField: 'tCompWaste', label: 'Comp Waste %' },
  { fobRefKey: 'rawWastePct',      targetField: 'tRawWaste',  label: 'Raw Waste %' },
  { fobRefKey: 'condimentPct',     targetField: 'tCondiment', label: 'Condiment %' },
  { fobRefKey: 'empFoodPct',       targetField: 'tEmpFood',   label: 'Emp Food %' },
  { fobRefKey: 'statLossPct',      targetField: 'tStatLoss',  label: 'Stat Loss %' },
  { fobRefKey: 'unexDiffPct',      targetField: 'tUnex',      label: 'Unexplained Diff %' },
  { fobRefKey: 'fobTargetPct',     targetField: 'tFOBTarget', label: 'FOB Target % (w/o Disc Coupon)' },
  { fobRefKey: 'totalFoodCostPct', targetField: 'tFOBTotal',  label: 'Total Food Cost %' },
  { fobRefKey: 'paperCostPct',     targetField: 'tPaperCost', label: 'P&L Paper Cost %' },
  { fobRefKey: 'opSupplyTarget',   targetField: 'tOpSupply',  label: 'Op Supply $' },
];

// ── Monthly Targets tab — the metrics monthly_targets (src/lib/supabase.js's save/load-
// MonthlyTargets) actually tracks, read back rather than a parallel invented list. Sales $ and
// the overall Labor % target get their own direct resolver since FOB Reference Table tracks
// Crew Labor % and a Comp-Sales-% growth figure, not a flat Sales $ target or the separate
// overall-Labor % the monthly_targets table also carries.
export const MONTHLY_TARGET_METRICS = [
  {
    // `paced: true` — grade this row against a month-end PACE projection (monthEndPace, above)
    // rather than the raw MTD actual, whenever the window qualifies (see computeTargetsVsActual
    // below). A flat monthly Sales $ target compared against a partial-month actual always
    // reads as a "miss" on day 3 of the month — the pace is the number that actually answers
    // "are we on track," so it (not the raw actual) drives diff/diffPct/status here; the real
    // MTD actual is still carried on the row under `actual` for the honest supporting number.
    key: 'salesAmt', label: 'Sales $', targetField: 'tProdSales', unit: 'dollar', better: 'higher', paced: true,
    actual: (ds, loc, range) => { const v = autoFirstTotal(ds, loc, range, 'sales'); return v > 0 ? v : null; },
  },
  {
    // Target resolution MUST go through labor-basis.js's resolveLaborTarget(), not a direct
    // tCrewLabor/tLabor field read — this is exactly the class of bug issue #153 exists to
    // prevent (computeOpsScore graded on the legacy tLabor while the approval cycle only ever
    // populates tCrewLabor). targetField is kept for the metric-definition shape/tests only;
    // the `target` resolver below is what actually runs.
    key: 'crewLaborPct', label: 'Crew Labor %', targetField: 'tCrewLabor', unit: 'pct', better: 'lower',
    target: (targets) => resolveLaborTarget(targets),
    actual: (ds, loc, range) => { const r = metricSumRatio(ds, [loc], range, 'laborPct'); return r ? r.value : null; },
  },
  {
    key: 'tpph', label: 'TPPH', targetField: 'tTpph', unit: 'rate', better: 'higher',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'tpph'),
  },
  ..._FOB_LEG_MAP.map(({ fobRefKey, targetField, label }) => {
    const ref = FOB_REFERENCE_METRICS.find(m => m.key === fobRefKey);
    return {
      key: fobRefKey, label, targetField,
      unit: _KIND_TO_UNIT[ref?.kind] || 'pct', better: ref?.better || 'lower',
      actual: (ds, loc, range) => resolveMetricForRange(ds, loc, fobRefKey, range),
    };
  }),
  // FOB Bonus Base % (owner request 2026-11-15: "wire in the Food cost items on monthly").
  // tFOBBonusBase ("Bonus Food Over Base Target" in the uploaded workbook, src/parsers/
  // index.js) is NOT a separate measured metric — it's a second, stricter target line graded
  // against the exact same real Total Food Cost % actual as tFOBTotal above. Confirmed from
  // the owner's own Monthly Projections workbook grid (analytics.js's PROJ_FIELDS), where
  // tFOBBonusBase sits immediately after tFOBTotal in the same Food Cost group with no actual
  // column of its own — the two targets, one actual. Reuses resolveMetricForRange('totalFoodCostPct')
  // verbatim rather than inventing a second "bonus" actual that doesn't exist anywhere in the
  // data model. tBonusLabor (the labor-side sibling target, same workbook row shape) stays
  // excluded — out of scope for a food-cost ask, same caveat as before.
  {
    key: 'fobBonusBase', label: 'FOB Bonus Food Threshold %', targetField: 'tFOBBonusBase', unit: 'pct', better: 'lower',
    actual: (ds, loc, range) => resolveMetricForRange(ds, loc, 'totalFoodCostPct', range),
  },
];

// ── Yearly Targets tab — the yearly_targets table's fields (src/lib/supabase.js's
// save/loadYearlyTargets) that also have a verified, already-proven actual resolver somewhere
// else in the codebase — reusing metric-source.js's daily auto-first resolvers and
// fob-reference.js's FOB-leg math exactly like the Monthly/Daily tabs above, never a new one.
// Deliberately excludes the yearly workbook's CSAT (tOsat/tOsatB2B/tVoiceEAD/t1800Contacts),
// Digital (tDigAppPct/tDigAppGCRD/tMcdGCRD/tMcdWait/tMcdStars) and People (tCrewStaffing/
// tShiftLeaders/tManagers/tHeadcount/tToShiftLeader/tToCrew090/tToCrewYTD) fields, plus tKvsu:
// review-engine.js's own REVIEW_METRIC_TARGET_FIELD mapping (the other real consumer of these
// same yearly targets) already establishes, field by field, that these are monthly-cadence
// SMG/Roster/Turnover/Digital snapshots with no metric-source.js daily resolver, that some have
// NO verified actual source at all yet (tMcdStars: "no actual-data source exists yet, enter
// manually"; tOsatB2B: "owner-held pending his own investigation"; t1800Contacts: a rate/count
// unit mismatch that was never wired), and that the rest would need review-engine's own
// byLocMonth() monthly rollup machinery reused at a different grain than this report's
// 7/14/21/28D/MTD day-range picker fits — a real follow-on, not a one-line addition like
// FOB Bonus Base above, so it is left for a separate pass rather than guessed at here.
//
// ✅ 2026-11-15 (owner follow-up): every entry's `actual` here is called with a YEAR-TO-DATE
// range (Jan 1 of the target year through the picker's selected end date, clamped into the
// target year) -- never the raw 7/14/21/28D/MTD window the Monthly/Daily tabs use -- because
// `computeTargetsVsActual` substitutes that widened range in for the yearly tab specifically
// (see its own comment). A flat multi-week window compared against a full ANNUAL target made no
// sense. `yProdSales` additionally needs real month-end pacing on top of that (a day-fraction
// pace at the YEAR grain would extrapolate an entire year from a handful of real months, far
// noisier than finishing the one month in progress), so it routes through `_yearlySalesRollup`
// instead of a flat sum; every ratio/rate metric below it is already dollar-weighted or
// mean-of-daily by construction, so simply widening its window to YTD is the complete fix with
// no new math needed.
export const YEARLY_TARGET_METRICS = [
  {
    // paced:true + paceFn mirrors the Monthly tab's Sales $ row: `actual` stays the honest,
    // un-projected sum of what's really posted (every completed month's real total + the
    // current month's real MTD-so-far); `paceFn` completes the current month's pace on top of
    // that, and status grades off the pace — same reasoning, same "nothing hidden" display.
    key: 'yProdSales', label: 'Sales $', targetField: 'tProdSales', unit: 'dollar', better: 'higher', paced: true,
    actual: (ds, loc, range) => _yearlySalesRollup(ds, loc, range.s.getFullYear(), range.e).real,
    paceFn: (ds, loc, range) => _yearlySalesRollup(ds, loc, range.s.getFullYear(), range.e).paced,
  },
  {
    // Same labor-basis.js routing as the monthly tab's crewLaborPct, and for the identical
    // reason: review-engine.js's own REVIEW_METRIC_TARGET_FIELD.labor comment (dispatch #142)
    // already corrected this exact field away from the legacy tLabor to tCrewLabor for yearly
    // data too — tCrewLabor is a real yearly_targets column (crew_labor_pct), not monthly-only.
    // metricSumRatio over the full YTD range IS the dollar-weighted monthly rollup the owner
    // asked for (Σnumerator/Σdenominator across every day Jan-to-date) -- summing day-level $
    // legs across a year equals summing each month's own $ subtotal, so no separate month loop
    // is needed here the way yProdSales needs one for its pacing.
    key: 'yLabor', label: 'Crew Labor %', targetField: 'tCrewLabor', unit: 'pct', better: 'lower',
    target: (targets) => resolveLaborTarget(targets),
    actual: (ds, loc, range) => { const r = metricSumRatio(ds, [loc], range, 'laborPct'); return r ? r.value : null; },
  },
  {
    key: 'yTpph', label: 'TPPH', targetField: 'tTpph', unit: 'rate', better: 'higher',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'tpph'),
  },
  {
    key: 'yOepe', label: 'OEPE (sec)', targetField: 'tOepe', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'oepe'),
  },
  {
    key: 'yPark', label: 'Parked %', targetField: 'tPark', unit: 'pct', better: 'lower',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'park'),
  },
  {
    key: 'yKvst', label: 'KVS Time (sec)', targetField: 'tKvst', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'kvst'),
  },
  {
    key: 'yR2p', label: 'R2P (sec)', targetField: 'tR2p', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'r2p'),
  },
  {
    // Same dollar-rollup equivalence as yLabor above: resolveMetricForRange sums fob-reference.js's
    // reconstructed TRUE daily $ deltas (never qsr_fob's cumulative snapshot) over whatever window
    // it's given, so handing it the full YTD range already IS the "Monthly rollup based on
    // dollars" the owner asked for, in one call.
    key: 'yFobTarget', label: 'FOB Target %', targetField: 'tFOBTarget', unit: 'pct', better: 'lower',
    actual: (ds, loc, range) => resolveMetricForRange(ds, loc, 'fobTargetPct', range),
  },
];

// Effective yearly target: the latest-available yearly_targets row for this store/year, falling
// straight back to {} (never DEFAULT_TARGETS) if none exists yet — unlike monthly_targets, a
// yearly workbook may simply not have been uploaded for a given year, and DEFAULT_TARGETS has
// no year dimension to fall back to anyway.
export function effectiveYearlyTarget(loc, year, allYearlyTargets) {
  const L = _normLoc(loc);
  return (allYearlyTargets && allYearlyTargets[year] && allYearlyTargets[year][L]) || {};
}

// ── Daily Targets tab — DEFAULT_TARGETS' daily-cadence operational metrics with a verified
// metric-source.js auto-first resolver, kept deliberately distinct from the Monthly tab's set
// above (no field appears in both tabs). metricAvg (mean of each day's own auto-first value,
// never a mean-of-averages) is the right aggregate for all of these — none are a cumulative
// MTD-snapshot source the way the FOB legs are.
export const DAILY_TARGET_METRICS = [
  { key: 'oepe',        label: 'OEPE (sec)',       targetField: 'tOepe',       unit: 'sec',    better: 'lower' },
  { key: 'kvst',        label: 'KVS Time (sec)',   targetField: 'tKvst',       unit: 'sec',    better: 'lower' },
  { key: 'park',        label: 'Parked %',         targetField: 'tPark',       unit: 'pct',    better: 'lower' },
  { key: 'avgCheck',    label: 'Average Check',    targetField: 'tAvgCheck',   unit: 'dollar', better: 'higher' },
  { key: 'tRedAPct',    label: 'T-Red A %',        targetField: 'tRedAPct',    unit: 'pct',    better: 'lower' },
  { key: 'tRedBPct',    label: 'T-Red B %',        targetField: 'tRedBPct',    unit: 'pct',    better: 'lower' },
  { key: 'posOverPct',  label: 'POS Over %',       targetField: 'tPosOverPct', unit: 'pct',    better: 'lower' },
  { key: 'cashOSPct',   label: 'Cash O/S %',       targetField: 'tCashOSPct',  unit: 'pct',    better: 'lower' },
  { key: 'drawerOpens', label: 'Drawer Opens',     targetField: 'tDrawer',     unit: 'count',  better: 'lower' },
  { key: 'promoPct',    label: 'Promo %',          targetField: 'tPromoPct',   unit: 'pct',    better: 'lower' },
].map(m => ({ ...m, actual: (ds, loc, range) => metricAvg(ds, [loc], range, m.key) }));

// target/actual -> 'ok' | 'watch' | 'miss' | 'none'. A metric is 'ok' the moment actual is on
// the goal side of target (at or past it in the `better` direction) — a store beating its target
// is never flagged. Otherwise the miss is graded by size: within ~10% of target (or within 1
// absolute point for a near-zero target, where a relative % would blow up or be meaningless,
// e.g. tUnex's 0.0 target) is 'watch'; further than that is 'miss'.
export function targetStatus(target, actual, better) {
  if (target == null || actual == null) return 'none';
  const diff = actual - target;
  const metGoal = better === 'higher' ? diff >= 0 : diff <= 0;
  if (metGoal) return 'ok';
  const magnitude = Math.abs(target) > 1e-6 ? Math.abs(diff / target) : Math.abs(diff);
  const threshold = Math.abs(target) > 1e-6 ? 0.10 : 0.01;
  return magnitude <= threshold ? 'watch' : 'miss';
}

// Widens a report-picker window into a Jan-1-through-asOf year-to-date range for the Yearly tab
// (owner-stated 2026-11-15: a flat 7/14/21/28D/MTD window compared against a full ANNUAL target
// made no sense). `asOf` is the picker's own selected end date, clamped into `targetYear` — a
// past year's asOf naturally clamps to Dec 31 (the whole year counts as "complete"), and a
// not-yet-started future year clamps to Jan 1 (nothing posted yet).
function _yearToDateRange(range, targetYear) {
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear, 11, 31);
  const raw = range?.e ? (range.e instanceof Date ? range.e : new Date(range.e)) : new Date();
  const e = raw > yearEnd ? yearEnd : (raw < yearStart ? yearStart : raw);
  return { s: yearStart, e };
}

// One row per store: { loc, metrics: [{key,label,unit,better,target,actual,diff,diffPct,status}] }
// `which`: 'monthly' | 'daily' | 'yearly'. `targetMonthYm` ('YYYY-M', e.g. from monthly-targets-
// v2.js's ymKey) is only used for the monthly tab. `targetYear` (a plain number/string year) is
// only used for the yearly tab, keyed into `allYearlyTargets` exactly as `ds.allYearlyTargets`
// (loadAllYearlyTargets) already stores it. The daily tab's targets are DEFAULT_TARGETS as-is
// (no monthly override table exists for those fields).
export function computeTargetsVsActual(ds, locs, { which, range, allMonthlyTargets, targetMonthYm, allYearlyTargets, targetYear }) {
  const metricDefs = which === 'daily' ? DAILY_TARGET_METRICS : which === 'yearly' ? YEARLY_TARGET_METRICS : MONTHLY_TARGET_METRICS;
  const list = (Array.isArray(locs) ? locs : [locs]).map(_normLoc);
  // Every yearly metric's actual()/paceFn() is called with the widened YTD range below instead
  // of the raw picker window; monthly/daily are untouched.
  const actualRange = which === 'yearly' ? _yearToDateRange(range, targetYear) : range;
  return list.map(loc => {
    const targets = which === 'daily' ? (DEFAULT_TARGETS[loc] || {})
      : which === 'yearly' ? effectiveYearlyTarget(loc, targetYear, allYearlyTargets)
      : effectiveMonthlyTarget(loc, targetMonthYm, allMonthlyTargets);
    const metrics = metricDefs.map(def => {
      const target = def.target ? def.target(targets) : (targets[def.targetField] ?? null);
      const actual = def.actual(ds, loc, actualRange);
      // Paced metrics grade against a pace projection, not the raw actual, when one applies.
      // Monthly Sales $ uses the generic monthEndPace(); Yearly Sales $ supplies its own
      // paceFn (the month-rollup described above) since a year-grain day-fraction pace would
      // extrapolate an entire year from a handful of real months. monthEndPace/paceFn both
      // return null for a non-qualifying window, and `graded` falls straight back to the plain
      // actual, so this is additive, never a regression for a case pacing doesn't apply to.
      const pace = def.paceFn ? def.paceFn(ds, loc, actualRange)
        : def.paced ? monthEndPace(actual, range?.e, targetMonthYm)
        : null;
      const graded = pace != null ? pace : actual;
      const diff = (target != null && graded != null) ? graded - target : null;
      const diffPct = (diff != null && Math.abs(target) > 1e-9) ? diff / Math.abs(target) : null;
      return {
        key: def.key, label: def.label, unit: def.unit, better: def.better,
        target, actual, pace, diff, diffPct, status: targetStatus(target, graded, def.better),
      };
    });
    return { loc, metrics };
  });
}
