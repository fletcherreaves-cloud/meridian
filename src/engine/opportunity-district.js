// @ts-nocheck
// ── District-wide Opportunity $ adapter (v1) ───────────────────────────────────
// memory/design-opportunity-dollars.md's flagship. Reuses what already exists rather than
// rebuilding it: the pure 3-pillar engine (src/engine/opportunity.js, already shipped and
// tested for the Leadership One-Pager) and its ds-adapter (buildOnePagerInputs,
// src/engine/one-pager-data.js). That adapter is generic over ANY locs/range despite its
// name -- it is not week-specific -- so this file's only real job is picking the MTD and
// trailing-6mo windows and giving the district-wide caller (At-A-Glance headline tile,
// drill-down panel, Attention Now) one call to get both the per-store rows and the
// district roll-up.
import { computeOpportunity, rankByOpportunity, annualize } from './opportunity.js';
import { buildOnePagerInputs } from './one-pager-data.js';
import { dKey, addD } from '../utils/date.js';

// Month-to-date: first of the current month through today (inclusive).
export function mtdRange(today = new Date()) {
  const e = dKey(today);
  const s = dKey(new Date(today.getFullYear(), today.getMonth(), 1));
  return { s, e };
}

// Trailing 6 FULL calendar months, deliberately excluding the current (partial) month --
// mixing a part-month into an otherwise-complete-month window is the exact "monthly base
// bleeding into a shorter window" class of bug fobByRange's own WINDOW-CONSISTENCY guard
// (one-pager-data.js) exists to prevent.
export function trailing6moRange(today = new Date()) {
  const priorMonthEnd = addD(new Date(today.getFullYear(), today.getMonth(), 1), -1);
  const e = dKey(priorMonthEnd);
  const s = dKey(new Date(today.getFullYear(), today.getMonth() - 6, 1));
  return { s, e };
}

// One computeOpportunity() call for the given locs/range, in 'target' mode -- each store
// vs its OWN agreed target, the accountability $ the design doc calls out as the default.
// computeOpportunity always also returns `benchmarks` (the internal best-in-class rates
// across this same store set), so the aspirational/BIC framing rides along on the same
// call without a second pass over the data.
export function districtOpportunity(ds, fobRows, locs, range) {
  const inputs = buildOnePagerInputs(ds, fobRows || [], locs || [], range);
  const opp = computeOpportunity(inputs, { mode: 'target' });
  return { ...opp, range, ranked: rankByOpportunity(opp.perStore) };
}

// $/year framing for the trailing-6mo total (QSRSoft's own "$/store/6mo" cadence,
// annualized ×2) -- "this gap is silently costing $X/year," not just this period.
export function annualizedFromSixMo(sixMoTotal$) {
  return annualize(sixMoTotal$, 2);
}
