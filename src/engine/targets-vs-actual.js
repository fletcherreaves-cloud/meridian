// @ts-nocheck
// ── Targets vs Actual report engine ──────────────────────────────────────────────────────────
// Owner request (2026-11-15): "a new report that focuses solely on the monthly targets and
// daily targets (separate tabs) that shows clearly what the current target is vs the actual
// results." Every actual-value resolution here reuses an existing, already-proven resolver --
// never re-derives metric-source's auto-first logic or fob-reference.js's FOB-leg delta math
// (that file's own header explains why qsr_fob's cumulative MTD snapshot can't be averaged
// directly; getting it wrong silently understates every food-cost %).
import { DEFAULT_TARGETS } from '../constants.js';
import { metricAvg, metricSumRatio, metricRate, rollupCapableMetricKeys } from './metric-source.js';
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

// Safely resolves a range boundary (a Date object, or a date-only 'YYYY-MM-DD' string) to a clean
// LOCAL-MIDNIGHT Date for calendar-day arithmetic. `new Date('2026-11-01')` parses a date-only
// string as UTC midnight, which in any timezone behind UTC (every US timezone this app serves)
// reads back as the PREVIOUS calendar day once .getFullYear()/.getMonth()/.getDate() are read --
// so this parses through local NOON first (no timezone's offset reaches a full 12 hours) and then
// immediately re-anchors to midnight on that same local calendar day, rather than carrying the
// noon time-of-day forward. Carrying noon forward is its own trap, found live 2026-11-15 testing
// the fix above under a real non-UTC timezone: every monthStart/monthEnd boundary elsewhere in
// this file is built via `new Date(y, m, d)`, which is always local midnight, so a day-count diff
// against a noon-shifted boundary is skewed by exactly half a day -- which Math.round() rounds UP
// into a full extra day, silently inflating daysInWindow by one.
function _localMidnight(v) {
  const d = v instanceof Date ? v : new Date(String(v) + 'T12:00:00');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Month-end pace projection (owner request 2026-11-15: "for the sales target can you come up
// with a way to pace it based on what the actual is MTD vs projected"). Not a new method --
// this is the exact linear run-rate the live Projection Workspace's "Actuals vs Target" pace
// table already uses for a true MTD window (analytics.js's CurrentMonthPaceSection: frac =
// dayOfMonth/daysInMonth; pace = actual/frac) -- for a window that genuinely starts on day 1 of
// the target month, `daysInWindow` below reduces to exactly `dayOfMonth`, so a store's pace here
// never disagrees with what that panel already shows for the same MTD window. Only meaningful for
// a window whose END falls inside the target month (an MTD-style partial month) -- a window
// that's a complete prior month (or doesn't land in the target month at all) is already a
// finished total, not a partial one to project forward, so this returns null rather than
// silently "pacing" a number that needs no pacing.
//
// ⚠️ BUG FIXED 2026-11-15 (owner report, same day as the cross-month blend ship): this used to
// take only the range's END date and divide `actual` by the CALENDAR day-of-month
// (endDate.getDate()/daysInMonth) -- correct ONLY when the window happens to start on day 1 (the
// MTD preset). Every OTHER window shape this report offers (7/14/21/28D) starts mid-month, so
// `actual` only ever covers the window's own day count, not "day 1 through the end date" -- and
// dividing a 14-day or 28-day total by a calendar-day-of-month fraction silently produced a wildly
// wrong pace (observed live: a 28-day window spanning Oct 18-Nov 14 produced a $690K pace for a
// $322K actual, roughly DOUBLE the true run rate, because frac=14/30 assumed all 14 of November's
// elapsed days were in `actual` when only 14 of the window's 28 days even WERE in November).
// Fixed by taking the full `range` (both ends) and using the window's OWN day count
// (`daysInWindow`) instead of the end date's calendar day-of-month -- a strict generalization: for
// a true MTD window (range.s = day 1) `daysInWindow` is identical to `endDate.getDate()`, so MTD
// behavior and the Projection Workspace agreement above are both unchanged.
// Also now returns null whenever the window's START isn't in the SAME month as its END (crosses a
// month boundary) -- `actual` there is a blend of two months' sales, so no single month's day
// fraction can validly scale it back out into a full-month figure without a second, target-month-
// only query this function doesn't have. That's not a loss: `_blendedMonthlyTarget` already
// prorates the TARGET to match exactly this window's own days, so the plain (unpaced) actual vs
// that already-scaled target is already a fair, apples-to-apples comparison for a crossing window
// -- pacing on top of an already-prorated target would double-count the scaling in opposite
// directions.
export function monthEndPace(actual, range, targetMonthYm) {
  if (actual == null || !range?.e || !targetMonthYm) return null;
  const [y, m] = String(targetMonthYm).split('-').map(Number);
  if (!y || !m) return null;
  const endDate = _localMidnight(range.e);
  if (endDate.getFullYear() !== y || endDate.getMonth() + 1 !== m) return null;
  const startDate = range.s ? _localMidnight(range.s) : endDate;
  if (startDate.getFullYear() !== y || startDate.getMonth() + 1 !== m) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysInWindow = Math.round((endDate - startDate) / 86400000) + 1;
  const frac = daysInWindow / daysInMonth;
  return frac > 0 ? actual / frac : null;
}

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
      const monthPace = monthEndPace(monthActual, monthRange, `${targetYear}-${m}`);
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
    // The one FOB Reference Table field this report was missing (owner follow-up 2026-11-15:
    // "while we are in there, let's also add com[p] sales line. only one missing" / "comp sales
    // %"). Same actual resolver the FOB Reference Table itself uses (fob-reference.js's
    // `compSalesPct` -> matchedVsLY year-over-year sales growth), targeted against
    // DEFAULT_TARGETS'/monthly_targets' `tGrowth` field -- the same comp-sales-growth target
    // FOB Reference Table and the Monthly Targets editor already carry for every store.
    key: 'compSalesPct', label: 'Comp Sales %', targetField: 'tGrowth', unit: 'pct', better: 'higher',
    actual: (ds, loc, range) => resolveMetricForRange(ds, loc, 'compSalesPct', range),
  },
  {
    key: 'tpph', label: 'TPPH', targetField: 'tTpph', unit: 'rate', better: 'higher',
    // [sweep:data-sourcing] metricRate (sum-of-legs ÷ sum-of-legs, falling back to metricAvg only
    // when metricSumRatio has nothing) -- same fix as crewLaborPct right above, just missed here.
    // This tab's range can include the current, still-open month (owner's own MTD requirement),
    // so metricAvg blended an in-progress business day into the month average at full weight --
    // the same completeness artifact CLAUDE.md's DAR/hour_slot section documents and that
    // dispatches #153/#155/#221 already fixed for every other tpph/oepe/kvst/r2p call site in
    // the app. metricRate never shows LESS than metricAvg used to (same fallback), only a more
    // accurate number when the raw legs resolve.
    actual: (ds, loc, range) => metricRate(ds, [loc], range, 'tpph'),
  },
  ..._FOB_LEG_MAP.map(({ fobRefKey, targetField, label }) => {
    const ref = FOB_REFERENCE_METRICS.find(m => m.key === fobRefKey);
    return {
      key: fobRefKey, label, targetField,
      unit: _KIND_TO_UNIT[ref?.kind] || 'pct', better: ref?.better || 'lower',
      actual: (ds, loc, range) => resolveMetricForRange(ds, loc, fobRefKey, range),
    };
  }),
  // FOB Bonus Base % REMOVED (owner follow-up 2026-11-15) -- it graded a "Bonus Food Over Base
  // Target" field against the exact same real Total Food Cost % actual as fobTotal above, with no
  // actual of its own, which read as a nonsensical double-digit "Miss" whenever the store's real
  // food cost % simply differed from this much stricter bonus threshold (they're different
  // thresholds on the SAME number, not two things that should agree). Confirmed unused elsewhere
  // in this file; DEFAULT_TARGETS/monthly_targets still carry tFOBBonusBase for any other
  // consumer that wants it (review-engine.js's REVIEW_METRIC_TARGET_FIELD, the Monthly Projections
  // workbook grid) -- only this report's row is removed.
];

// FOB "component" rows (the waste/variance/cost legs that roll up into the FOB summary line
// below) vs. the 1 "summary" row they culminate in -- owner follow-up 2026-11-15: visually group
// the components and draw the eye toward the line they build to. Derived from _FOB_LEG_MAP (the
// single source of truth for this report's FOB rows) rather than a second hand-typed key list, so
// adding/removing a FOB leg there can never silently drift out of sync with the grouping here.
//
// ⚠️ Narrowed same day (owner follow-up): Base Food %, Disc Coupon %, and Total Food Cost % are
// deliberately left UNSHADED, not grouped with the rest -- "this will help the stores focus on
// only what they are tasked or charged to deliver." Base Food % (recipe/vendor-set cost) and Disc
// Coupon % (corporate promo redemptions) aren't store-controllable the way the other legs are, and
// FOB Target % (w/o Disc Coupon) exists SPECIFICALLY to exclude Disc Coupon from what a store is
// held to -- grouping it back in via shading would visually contradict the one number whose whole
// point is excluding it. Total Food Cost % (which includes both excluded legs) stops being the
// group's "summary" line for the same reason; FOB Target % is the sole summary now.
export const FOB_SUMMARY_KEYS = ['fobTargetPct'];
const _FOB_UNSHADED_KEYS = ['baseFoodPct', 'discCouponPct', 'totalFoodCostPct', 'paperCostPct', 'opSupplyTarget'];
export const FOB_COMPONENT_KEYS = _FOB_LEG_MAP
  .map(m => m.fobRefKey)
  .filter(k => !FOB_SUMMARY_KEYS.includes(k) && !_FOB_UNSHADED_KEYS.includes(k));

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
    // rollupFromMonthly: true -- owner follow-up 2026-11-15 ("fix the targets here as well like
    // we did for monthly"): the uploaded yearly workbook doesn't carry a standalone annual Sales
    // $ figure for every store (it's naturally a monthly-cadence number that already lives in
    // Monthly Targets), so when this store/year has no direct yearly value, _yearlyTarget rolls
    // one up from Monthly Targets instead of leaving the cell blank. See _yearlyTarget's own
    // header for why only metrics that opt in here get that fallback.
    key: 'yProdSales', label: 'Sales $', targetField: 'tProdSales', unit: 'dollar', better: 'higher', paced: true,
    rollupFromMonthly: true,
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
    rollupFromMonthly: true, // same reasoning as yProdSales above -- Crew Labor % is also a Monthly Targets field, not a standalone annual one
    target: (targets) => resolveLaborTarget(targets),
    actual: (ds, loc, range) => { const r = metricSumRatio(ds, [loc], range, 'laborPct'); return r ? r.value : null; },
  },
  {
    key: 'yTpph', label: 'TPPH', targetField: 'tTpph', unit: 'rate', better: 'higher',
    // [sweep:data-sourcing] metricRate, same reasoning as the Monthly tab's tpph row above --
    // this YTD range always includes the current, in-progress month (see this file's own
    // 2026-11-15 comment on YEARLY_TARGET_METRICS above). metricAvg blended that open month in
    // at full weight; metricRate sums the raw legs instead, falling back to the old metricAvg
    // figure only when the legs can't resolve, so no number that displayed before goes blank.
    actual: (ds, loc, range) => metricRate(ds, [loc], range, 'tpph'),
  },
  {
    key: 'yOepe', label: 'OEPE (sec)', targetField: 'tOepe', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricRate(ds, [loc], range, 'oepe'),
  },
  {
    key: 'yPark', label: 'Parked %', targetField: 'tPark', unit: 'pct', better: 'lower',
    // 'park' has no declared ratio numerator/denominator in METRIC_SOURCES (not in
    // rollupCapableMetricKeys()) -- metricSumRatio would unconditionally return null for it, so
    // metricAvg stays correct here; left unchanged, not an oversight.
    actual: (ds, loc, range) => metricAvg(ds, [loc], range, 'park'),
  },
  {
    key: 'yKvst', label: 'KVS Time (sec)', targetField: 'tKvst', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricRate(ds, [loc], range, 'kvst'),
  },
  {
    key: 'yR2p', label: 'R2P (sec)', targetField: 'tR2p', unit: 'sec', better: 'lower',
    actual: (ds, loc, range) => metricRate(ds, [loc], range, 'r2p'),
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

// Resolves how many days of `range` fall in each calendar month it overlaps -- {ym, daysInWindow,
// daysInMonth} per month, in chronological order. A single-month window (the common case) returns
// exactly one entry; a 7/14/21/28D window that crosses a month boundary returns two.
//
// ⚠️ BUG FIXED 2026-11-15 (owner observation, live): a bare `new Date('2026-11-01')` parses a
// date-only ISO string as UTC MIDNIGHT, not local midnight -- in any timezone behind UTC (every US
// timezone this app serves), that lands on the PREVIOUS calendar day locally. A true single-month
// MTD window (Nov 1 - Nov 14) was landing one tick into October, producing a real-but-meaningless
// extra month entry ("Blended: 0d Oct + 14d Nov") for what should read as a plain, unblended
// single-month target. Fixed via _localMidnight() above (not a bare noon-shift -- that alone
// reintroduces a different, subtler day-count bug against this function's own midnight-built
// monthStart/monthEnd boundaries; see that helper's own comment).
function _monthsInRange(range) {
  const s = _localMidnight(range?.s);
  const e = _localMidnight(range?.e);
  const months = [];
  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const lastMonthStart = new Date(e.getFullYear(), e.getMonth(), 1);
  while (cur <= lastMonthStart) {
    const monthStart = cur;
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0); // last day of this month
    const overlapStart = s > monthStart ? s : monthStart;
    const overlapEnd = e < monthEnd ? e : monthEnd;
    const daysInWindow = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
    months.push({ ym: `${cur.getFullYear()}-${cur.getMonth() + 1}`, daysInWindow, daysInMonth: monthEnd.getDate() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

// Owner request 2026-11-15: a 7/14/21/28D picker window can cross a month boundary (e.g.
// Oct 28-Nov 3), and a flat single-month target read (the old effectiveMonthlyTarget(loc,
// targetMonthYm, ...) call, keyed ONLY off range.e's month) silently compared the WHOLE window's
// actual against just one of the two months' targets -- a store could show "On Target" or "Miss"
// against a number that only ever applied to part of the days being graded. Owner's own framing:
// "smartly determine, through math, what the aggregated target would be while making it clear
// targets are blended across multiple periods" (the alternative considered and rejected: listing
// both months' targets as separate rows, which would double this already-dense table's height for
// a case that's the exception, not the rule).
//
// Fixed by resolving each metric's target PER OVERLAPPED MONTH -- so def.target()'s own
// special-case resolvers (crewLaborPct's resolveLaborTarget(), which walks a fallback chain, not
// a single field read) run correctly against THAT month's real targets object, never against a
// pre-blended Frankenstein of two different months' raw fields -- then blending the RESOLVED
// VALUES: day-prorated-and-summed for a dollar target (a monthly $ figure scaled down to however
// much of that month the window actually covers, then summed across months -- the natural
// meaning of "expected $ for these specific days"), day-weighted-averaged for everything else
// (rate/pct/sec/count -- the window's own day mix of the two months' target levels). A month with
// no resolvable value (no override and no DEFAULT_TARGETS entry) is excluded from the blend
// rather than treated as 0, matching this report's existing "missing is null, not zero"
// discipline elsewhere.
//
// Returns `{ value, blend }`. `blend` is null whenever the window sits inside a single month (the
// common case -- zero behavior change there); otherwise it lists the month(s) that actually
// contributed a value as `{ym, days}`, so the UI can show a "blended across N days in <month> + M
// days in <month>" line next to the target rather than ever presenting a cross-month number as if
// it were an ordinary single-month one. If the window spans two months but only one has a real
// target, `blend` still has length 1 -- the UI renders that case as "covers Nd of <month> only"
// rather than claiming a blend that didn't happen, see targets-vs-actual-report.js.
export function _blendedMonthlyTarget(def, range, allMonthlyTargets, loc) {
  const months = _monthsInRange(range);
  const resolved = months.map(m => {
    const targets = effectiveMonthlyTarget(loc, m.ym, allMonthlyTargets);
    const raw = def.target ? def.target(targets) : targets[def.targetField];
    const value = (raw == null || raw === '') ? null : Number(raw);
    return { ...m, value: Number.isFinite(value) ? value : null };
  });
  const parts = resolved.filter(p => p.value != null);
  if (!parts.length) return { value: null, blend: null };
  // A true single-month window needs no proration -- the flat monthly target stays exactly as
  // every existing single-month consumer (including pacing, which only ever applies within one
  // month) already expects. Only once the WINDOW itself spans more than one month does a flat
  // monthly $ figure stop meaning anything on its own -- at that point every contributing month's
  // value must be day-scaled, even if only one month ended up contributing (a lone month's own
  // FULL target would wildly overstate a partial week drawn from it).
  if (months.length === 1) return { value: parts[0].value, blend: null };
  // Every window month is listed here, including one with no resolvable value (`missing: true`)
  // -- so the UI can be honest that the target doesn't cover the FULL window even in the
  // single-contributing-month case, not just when two months both had data to blend.
  const blend = resolved.map(p => ({ ym: p.ym, days: p.daysInWindow, missing: p.value == null }));
  let value;
  if (def.unit === 'dollar') {
    value = parts.reduce((a, p) => a + p.value * (p.daysInWindow / p.daysInMonth), 0);
  } else {
    const totalDays = parts.reduce((a, p) => a + p.daysInWindow, 0);
    value = totalDays > 0 ? parts.reduce((a, p) => a + p.value * p.daysInWindow, 0) / totalDays : null;
  }
  return { value, blend };
}

// Effective yearly target: the latest-available yearly_targets row for this store/year, falling
// straight back to {} (never DEFAULT_TARGETS) if none exists yet — unlike monthly_targets, a
// yearly workbook may simply not have been uploaded for a given year, and DEFAULT_TARGETS has
// no year dimension to fall back to anyway.
export function effectiveYearlyTarget(loc, year, allYearlyTargets) {
  const L = _normLoc(loc);
  return (allYearlyTargets && allYearlyTargets[year] && allYearlyTargets[year][L]) || {};
}

// Yearly Targets tab — owner follow-up 2026-11-15: "can we fix the targets here as well like we
// did for monthly" (Sales $ and Crew Labor % were showing "—" for stores that plainly DO have a
// yearly_targets row on file, because that workbook only ever carries the annual-cadence
// OPERATIONAL metrics -- TPPH/OEPE/Parked/KVS/R2P/FOB% -- not a standalone annual $ or % figure
// for Sales $ / Crew Labor %, which already live month-by-month in the Monthly Targets table the
// Monthly tab blends from. Rather than requiring a second, redundant manual entry of a number
// that's already implied by 12 months of real monthly targets, roll those up the same way the
// Monthly tab's own _blendedMonthlyTarget already proved out for crossing a month boundary —
// this is that exact function, just handed the widened year-to-date span instead of a 1-2 month
// window, used ONLY when the yearly workbook itself has no value for this field (a real uploaded
// annual figure always wins; this never overrides one that exists).
//
// One adjustment vs. a straight reuse: _blendedMonthlyTarget prorates a DOLLAR target down by
// (daysInWindow/daysInMonth) for every contributing month — exactly right for the Monthly tab's
// narrow sub-month window, where the window never equals a full month's days. At YTD scale every
// COMPLETED month already has daysInWindow===daysInMonth (ratio 1, no distortion), so the only
// month that proration actually touches is the current, still-in-progress one. For a PACED metric
// (today, only Sales $) that's wrong: computeTargetsVsActual grades a paced metric's status
// against the PACED actual, which already assumes the in-progress month finishes at its current
// run rate — so its target must count that month's FULL goal too, or the comparison understates
// the bar the pace is actually being judged against (a store would read as "beating target" on
// day 3 of the month purely because the target was shrunk to day-3-of-30, not because it's
// actually ahead). So a paced metric sums each included month's FULL target, never prorated.
// Every other (non-paced) yearly metric already grades against the plain elapsed-to-date actual
// (e.g. Crew Labor %'s metricSumRatio, which only sums real $ legs through the days that have
// actually happened) — for those, _blendedMonthlyTarget's existing day-weighted-average already
// weights the in-progress month by only its elapsed days, which is already the matching basis, so
// it's reused completely unmodified.
function _yearlyTargetFromMonthly(def, range, allMonthlyTargets, loc) {
  if (!def.paced) return _blendedMonthlyTarget(def, range, allMonthlyTargets, loc);
  const months = _monthsInRange(range);
  const resolved = months.map(m => {
    const targets = effectiveMonthlyTarget(loc, m.ym, allMonthlyTargets);
    const raw = def.target ? def.target(targets) : targets[def.targetField];
    const value = (raw == null || raw === '') ? null : Number(raw);
    return { ...m, value: Number.isFinite(value) ? value : null };
  });
  const parts = resolved.filter(p => p.value != null);
  if (!parts.length) return { value: null, blend: null };
  const blend = resolved.map(p => ({ ym: p.ym, days: p.daysInWindow, missing: p.value == null }));
  const value = parts.reduce((a, p) => a + p.value, 0); // full per-month target, never prorated
  return { value, blend };
}

// Resolves a Yearly tab target: the uploaded yearly workbook's own value if this store/year has
// one for this field, else the Monthly-Targets rollup above. `source` tells the UI which path
// won, so a rolled-up number is never shown as if it were an ordinary on-file annual figure (see
// targets-vs-actual-report.js's _yearlyRollupLabel).
//
// Gated on `def.rollupFromMonthly` -- deliberately NOT applied to every YEARLY_TARGET_METRICS
// entry. OEPE/Parked %/KVS Time/R2P have no Monthly Targets equivalent to roll up from at all
// (those are DAILY-tab fields, DEFAULT_TARGETS-only, no month-specific override table exists) --
// but effectiveMonthlyTarget() unconditionally merges in DEFAULT_TARGETS regardless of which
// field is asked for, so calling _yearlyTargetFromMonthly for them wouldn't fail, it would
// silently fall back to the SAME flat DEFAULT_TARGETS number every month, every year, which is
// not a "rollup" at all and would quietly erase the "no yearly workbook uploaded -> blank, not a
// guess" behavior those fields are supposed to keep. So only the two fields the owner actually
// flagged as broken -- Sales $ and Crew Labor %, both genuinely monthly-cadence numbers that
// already live in Monthly Targets -- opt in via the flag on their own metric def.
export function _yearlyTarget(def, directTargets, range, allMonthlyTargets, loc) {
  const raw = def.target ? def.target(directTargets) : (directTargets ? directTargets[def.targetField] : null);
  const direct = (raw == null || raw === '') ? null : Number(raw);
  if (Number.isFinite(direct)) return { value: direct, blend: null, source: 'yearly' };
  if (!def.rollupFromMonthly) return { value: null, blend: null, source: null };
  const { value, blend } = _yearlyTargetFromMonthly(def, range, allMonthlyTargets, loc);
  return { value, blend, source: value != null ? 'monthly-rollup' : null };
}

// ── Daily Targets tab — DEFAULT_TARGETS' daily-cadence operational metrics with a verified
// metric-source.js auto-first resolver, kept deliberately distinct from the Monthly tab's set
// above (no field appears in both tabs).
//
// ⚠️ CORRECTED 2026-11-17 (sweep:data-sourcing follow-up, owner-requested after the Monthly/
// Yearly tab fix in v5.812) — this header used to claim "metricAvg is the right aggregate for
// all of these... none are a cumulative MTD-snapshot source," which answers a DIFFERENT question
// (double-averaging) than the one that actually matters here: does this tab's range ever include
// the current, still-open business day? It can. The 5 built-in presets (7/14/21/28D, MTD) are
// genuinely safe — PanelControls.js's resolveDatePreset anchors every one of them to
// lastClosedBusinessDay(), never literal "today" — but ReportShell's DateRangeControl also
// offers a "Custom…" option with a real <input type="date">, and nothing stops a user picking
// today as the end date. A custom range ending today hits the exact completeness artifact
// (CLAUDE.md's DAR/hour_slot section; dispatches #153/#155/#221; v5.812's own fix to this file's
// Monthly/Yearly tabs) for every metric below with a real numerator/denominator.
//
// Fixed the same way as the Monthly/Yearly tabs, but future-proofed: rather than hand-picking
// which of these 10 keys are ratio-capable (oepe/kvst/avgCheck/tRedAPct/tRedBPct/posOverPct/
// cashOSPct, confirmed via rollupCapableMetricKeys() as of this writing — park/drawerOpens/
// promoPct are not), `_ratioCapable` is computed from that same registry function once, so a
// metric that gains a `derive:{kind:'ratio'}` chain later is covered automatically and this
// comment can't go stale the way the old one did.
const _ratioCapable = new Set(rollupCapableMetricKeys());
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
].map(m => ({
  ...m,
  actual: (ds, loc, range) => (_ratioCapable.has(m.key) ? metricRate : metricAvg)(ds, [loc], range, m.key),
}));

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
  // Same UTC-midnight date-string trap _monthsInRange/monthEndPace guard against -- see _localMidnight().
  const raw = range?.e ? _localMidnight(range.e) : new Date();
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
    // Monthly targets resolve PER METRIC below (_blendedMonthlyTarget) rather than once here --
    // a 7/14/21/28D window can cross a month boundary, and each month's own targets object has
    // to be resolved separately for def.target()'s special-case resolvers (crewLaborPct) to run
    // correctly. See _blendedMonthlyTarget's own header for the full reasoning.
    const targets = which === 'daily' ? (DEFAULT_TARGETS[loc] || {})
      : which === 'yearly' ? effectiveYearlyTarget(loc, targetYear, allYearlyTargets)
      : null;
    const metrics = metricDefs.map(def => {
      let target, blend = null, targetSource = null;
      if (which === 'monthly') {
        ({ value: target, blend } = _blendedMonthlyTarget(def, range, allMonthlyTargets, loc));
      } else if (which === 'yearly') {
        ({ value: target, blend, source: targetSource } = _yearlyTarget(def, targets, actualRange, allMonthlyTargets, loc));
      } else {
        target = def.target ? def.target(targets) : (targets[def.targetField] ?? null);
      }
      const actual = def.actual(ds, loc, actualRange);
      // Paced metrics grade STATUS against a pace projection, not the raw actual, when one
      // applies. Monthly Sales $ uses the generic monthEndPace(); Yearly Sales $ supplies its own
      // paceFn (the month-rollup described above) since a year-grain day-fraction pace would
      // extrapolate an entire year from a handful of real months. monthEndPace/paceFn both
      // return null for a non-qualifying window, and `graded` falls straight back to the plain
      // actual, so this is additive, never a regression for a case pacing doesn't apply to.
      const pace = def.paceFn ? def.paceFn(ds, loc, actualRange)
        : def.paced ? monthEndPace(actual, range, targetMonthYm)
        : null;
      const graded = pace != null ? pace : actual;
      // Variance grades off `graded` -- the PACE for a paced metric mid-window, the plain actual
      // for everything else (unpaced metrics, a fully-elapsed window, or a cross-month blend,
      // where `_blendedMonthlyTarget` has already scaled Target to match the window's own days
      // and pacing on top would double-count). This went through two earlier iterations the same
      // day, in opposite directions, both owner-driven and both worth recording:
      //   1) ORIGINAL: graded minus target. A $141,763 target and a $145,872 actual (a real gap
      //      of +$4,109) could show a "+$194,864" Variance -- actually $336,628 PACE minus
      //      target, a number never shown as the row's own Actual at all. Confusing.
      //   2) "HONEST" FIX (owner: "Seems like actual vs target would be ideal and easy for
      //      anyone to understand"): actual minus target, always. But seen live on a real MTD
      //      window, that produced the inverse confusion -- a real $168,968 Sales $ shortfall
      //      against the FULL month's target, shown right next to a Status that read "On Target"
      //      off the PACE. Technically honest, but the two numbers visibly disagreed for anyone
      //      glancing at the row.
      //   3) THIS version (owner: "The sales target...should be pace vs actual[vs target]...
      //      would make sense to anyone seeing it[,] for MTD especially"): back to graded minus
      //      target, so Variance and Status always agree (same basis, by construction) -- MTD
      //      pacing is exactly the case this restores. The raw to-date actual stays fully visible
      //      right next to it (the Actual column's own number, with Pace as its own labeled line)
      //      so nothing from (2) is hidden, it's just no longer the number Variance itself grades.
      const diff = (target != null && graded != null) ? graded - target : null;
      const diffPct = (diff != null && Math.abs(target) > 1e-9) ? diff / Math.abs(target) : null;
      return {
        key: def.key, label: def.label, unit: def.unit, better: def.better,
        target, blend, targetSource, actual, pace, diff, diffPct, status: targetStatus(target, graded, def.better),
      };
    });
    return { loc, metrics };
  });
}
