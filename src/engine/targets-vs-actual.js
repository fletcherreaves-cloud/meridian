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
    key: 'salesAmt', label: 'Sales $', targetField: 'tProdSales', unit: 'dollar', better: 'higher',
    actual: (ds, loc, range) => { const v = autoFirstTotal(ds, loc, range, 'sales'); return v > 0 ? v : null; },
  },
  {
    key: 'crewLaborPct', label: 'Crew Labor %', targetField: 'tCrewLabor', unit: 'pct', better: 'lower',
    actual: (ds, loc, range) => { const r = metricSumRatio(ds, [loc], range, 'laborPct'); return r ? r.value : null; },
  },
  {
    key: 'laborPctOverall', label: 'Labor % (Overall)', targetField: 'tLabor', unit: 'pct', better: 'lower',
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
];

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

// One row per store: { loc, metrics: [{key,label,unit,better,target,actual,diff,diffPct,status}] }
// `which`: 'monthly' | 'daily'. `targetMonthYm` ('YYYY-M', e.g. from monthly-targets-v2.js's
// ymKey) is only used for the monthly tab — the daily tab's targets are DEFAULT_TARGETS as-is
// (no monthly override table exists for those fields).
export function computeTargetsVsActual(ds, locs, { which, range, allMonthlyTargets, targetMonthYm }) {
  const metricDefs = which === 'daily' ? DAILY_TARGET_METRICS : MONTHLY_TARGET_METRICS;
  const list = (Array.isArray(locs) ? locs : [locs]).map(_normLoc);
  return list.map(loc => {
    const targets = which === 'daily'
      ? (DEFAULT_TARGETS[loc] || {})
      : effectiveMonthlyTarget(loc, targetMonthYm, allMonthlyTargets);
    const metrics = metricDefs.map(def => {
      const target = targets[def.targetField] ?? null;
      const actual = def.actual(ds, loc, range);
      const diff = (target != null && actual != null) ? actual - target : null;
      const diffPct = (diff != null && Math.abs(target) > 1e-9) ? diff / Math.abs(target) : null;
      return {
        key: def.key, label: def.label, unit: def.unit, better: def.better,
        target, actual, diff, diffPct, status: targetStatus(target, actual, def.better),
      };
    });
    return { loc, metrics };
  });
}
