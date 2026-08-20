// @ts-nocheck
// ── Rules Registry interpreter (dispatch #36, Phase 0b) ────────────────────────
// Evaluates one `security_rules` row (supabase/schema-security-rules.sql) against a DATA
// CONTEXT and returns pass/fail + the computed value. Rules are DATA, not code (plan §1
// principle 7, memory/plan-security-loss-prevention.md §6) -- this file is the only place
// LOGIC_EXPRESSION gets interpreted, so a new rule of an already-handled LOGIC_TYPE is a row
// insert, never a code change.
//
// `dataContext` is keyed BY the rule's own DATA_REQUIRED entries, e.g. {audit_rows: [...]} --
// not a flat row array -- so a future rule needing more than one source table (Phase 3
// cross-domain correlation) can be handed a context with multiple keys without this function's
// signature changing. Today's threshold/ratio types read a single source (data_required[0]);
// the caller is responsible for having already scoped those rows to the right subject/window/
// baseline population (personal vs peer vs store vs network) -- that selection is
// src/engine/security-baselines.js's job, not this interpreter's.
//
// LOGIC_EXPRESSION shapes handled today:
//   threshold: { field, agg: 'sum'|'count'|'avg', denominator?: {field, agg}, scale?, comparator,
//                min_denominator?, min_numerator? }
//   ratio:     { numerator: {field, agg, abs?}, denominator: {field, agg}, scale, comparator,
//                min_denominator?, min_numerator? }
//   z-score:   SAME numerator/denominator/scale/min_denominator/min_numerator shape as ratio -- the
//              raw rate is z-scored against a `baseline` the CALLER computed and passed via
//              evaluateRule()'s options (dispatch #36's security-baselines.js, e.g.
//              storeBaseline()) instead of compared to a fixed constant. `threshold` on a z-score
//              rule means SIGMA, not a rate -- the same {"default": 2.5} shape a ratio rule's
//              threshold uses means something entirely different here. `min_value` (optional) is a
//              materiality floor the computed RATE must ALSO clear; `min_numerator` (dispatch #45
//              §A, optional) is a materiality floor the RAW numerator sum must ALSO clear,
//              independent of the rate -- a rate can be statistically unusual on a denominator so
//              large the underlying absolute amount is trivial regardless of the rate (INV-002:
//              0.09 per $1,000 sales against a $2.1M denominator is still only a few hundred real
//              dollars). All gates that are SET are required to flag; an unset gate is a no-op.
// Threshold/ratio normalize against exposure when a denominator is present (plan §1 principle 1)
// using `scale`, which IS memory/data-acquisition-shopping-list.md's per-$1,000-sales /
// per-1,000-transactions convention (scale: 1000) -- not a free parameter each rule invents.
//
// `min_denominator` (dispatch #42 §5, widened to every denominator-bearing rule, not just
// INV-001): a minimum-exposure floor, carried as PER-RULE data inside logic_expression, never an
// engine constant -- the sensible floor for exp_usage units and for drawerSales dollars are
// different numbers, and a rule with no floor set (the common case) behaves exactly as before.
// Applied at the ONE shared choke point both evalRatio()/evalThreshold() already had for a
// literally-zero denominator -- the floor is that same condition widened from `!denominatorSum`
// to `denominatorSum < min_denominator`, so z-score (which reuses evalRatio() for its raw rate)
// gets the floor for free with no code of its own.
//
// z-score is now IMPLEMENTED (dispatch #42) -- see evaluateZScoreRule() below. sequence /
// window-function remain STUBBED: evaluateRule() returns {implemented:false, pass:null} for
// these rather than throwing, so a rule row of ANY LOGIC_TYPE the schema accommodates can exist
// today without every consumer needing its own type-check first. Building these out is Phase 3
// (sequence engine) -- explicitly out of scope for this dispatch.

const COMPARATORS = {
  gte: (v, t) => v >= t,
  gt:  (v, t) => v > t,
  lte: (v, t) => v <= t,
  lt:  (v, t) => v < t,
  eq:  (v, t) => v === t,
};

function num(v) { return Number.isFinite(v) ? v : (Number(v) || 0); }

function aggField(rows, field, agg = 'sum', { abs = false } = {}) {
  if (agg === 'count') return rows.length;
  const vals = rows.map(r => (abs ? Math.abs(num(r[field])) : num(r[field])));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (agg === 'sum') return sum;
  if (agg === 'avg') return rows.length ? sum / rows.length : 0;
  throw new Error(`security-rules: unknown agg '${agg}'`);
}

// jsonb columns already arrive parsed via supabase-js; guard for callers passing raw fixtures.
function asObj(v) { return typeof v === 'string' ? JSON.parse(v) : (v || {}); }
function asArr(v) { return typeof v === 'string' ? JSON.parse(v) : (v || []); }

// THRESHOLD is {"default": n} or {"default": n, "byLoc": {loc: n}} -- per-location-overridable
// per plan §6's own field description. `loc` is optional; omit for a network-wide rule.
export function resolveThreshold(rule, loc) {
  const t = asObj(rule.threshold);
  if (t == null) return null;
  if (loc != null && t.byLoc && t.byLoc[loc] != null) return num(t.byLoc[loc]);
  return t.default != null ? num(t.default) : null;
}

// Shared choke point (dispatch #42 §5): a denominator that's literally zero already produced an
// honest null; `min_denominator` widens the SAME guard to "too small to mean anything," per rule.
function belowExposureFloor(expr, denominatorSum) {
  return expr.min_denominator != null && denominatorSum < num(expr.min_denominator);
}

// `min_numerator` (dispatch #45 Part A): an absolute-magnitude materiality floor on the RAW
// numerator sum, independent of the computed rate/z-score -- built exactly like `min_denominator`
// (per-rule data inside logic_expression, never an engine constant, applied at the ONE shared
// choke point every rule type already funnels through), but with the OPPOSITE null/false asymmetry
// on purpose. `min_denominator` unmet means there wasn't enough exposure to compute a rate at all
// -- an honest `pass:null`. `min_numerator` unmet means a rate WAS computed and even a genuinely
// unusual one (high z-score, or a rate crossing a plain threshold) doesn't matter because the
// absolute dollar/count amount behind it is trivial -- "3σ above peers on $4 of variance is
// statistically interesting and operationally worthless" (dispatch #42 §3, the case this closes
// the gap on: INV-002's own `min_value` gates the RATE, and 0.09 per $1,000 sales against a $2.1M
// denominator is still only a few hundred real dollars). That is a real, decided "clear" (`pass:
// false`), not an unevaluated null -- the rule DID form a verdict, it just decided the magnitude
// doesn't clear the bar. Checked by the CALLERS (evaluateRule / evaluateZScoreRule), not inside
// evalRatio/evalThreshold themselves, precisely because it must NOT collapse `value` to null the
// way the exposure floor does -- the rate stays real and visible, only `pass` changes.
function belowNumeratorFloor(expr, numeratorSum) {
  return expr.min_numerator != null && numeratorSum < num(expr.min_numerator);
}

function evalRatio(expr, rows) {
  const numeratorSum = aggField(rows, expr.numerator.field, expr.numerator.agg || 'sum', { abs: !!expr.numerator.abs });
  const denominatorSum = aggField(rows, expr.denominator.field, expr.denominator.agg || 'sum');
  if (!denominatorSum || belowExposureFloor(expr, denominatorSum)) return { value: null, numeratorSum, denominatorSum };
  const scale = expr.scale || 1;
  return { value: (numeratorSum / denominatorSum) * scale, numeratorSum, denominatorSum };
}

function evalThreshold(expr, rows) {
  const numeratorSum = aggField(rows, expr.field, expr.agg || 'sum');
  if (!expr.denominator) return { value: numeratorSum, numeratorSum, denominatorSum: null };
  const denominatorSum = aggField(rows, expr.denominator.field, expr.denominator.agg || 'sum');
  if (!denominatorSum || belowExposureFloor(expr, denominatorSum)) return { value: null, numeratorSum, denominatorSum };
  const scale = expr.scale || 1;
  return { value: (numeratorSum / denominatorSum) * scale, numeratorSum, denominatorSum };
}

// A null value can now mean either "literally zero exposure" or "below the measured floor" --
// distinguished here (not by threading a second flag through every evalFn) since both callers
// (evaluateRule's main path and evaluateZScoreRule) need the exact same distinction.
function noExposureReason(expr, denominatorSum) {
  return denominatorSum === 0
    ? 'no exposure (zero denominator) in window'
    : `denominator below minimum exposure floor (${expr.min_denominator})`;
}

const IMPLEMENTED_TYPES = { threshold: evalThreshold, ratio: evalRatio };

// Below this many OTHER stores/peers reporting the same subject, a mean/stdev is dominated by
// individual noise, not a real population -- "a z-score against two other stores is not a
// signal" (dispatch #42 §3). A stated, conservative floor in the same "first guess, tune later"
// tier as every threshold in this build, not measured from live data (that's storeBaseline's own
// *n* at call time, which varies per item/window -- a property of the call, not something this
// file could query).
const MIN_BASELINE_N = 5;

// dispatch #42 §3 -- z-score compares THIS subject's rate against a peer/store baseline's
// mean/stdev instead of a fixed constant, so a systematic bias shared by every peer (e.g. a
// mismapped exp_usage figure) cancels out where an absolute threshold would inherit it whole.
// Reuses evalRatio() for the raw rate (and gets the min_denominator exposure floor for free,
// since evalRatio already applies it) -- a z-score rule's logic_expression is the SAME
// numerator/denominator/scale shape a ratio rule uses, just compared differently once computed.
function evaluateZScoreRule(rule, dataContext, { loc, baseline } = {}) {
  const dataRequired = asArr(rule.data_required);
  const primary = dataRequired[0];
  const rows = (dataContext && dataContext[primary]) || [];
  const expr = asObj(rule.logic_expression);
  const { value, numeratorSum, denominatorSum } = evalRatio(expr, rows);
  const threshold = resolveThreshold(rule, loc);

  if (value == null) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, zscore: null, reason: noExposureReason(expr, denominatorSum) };
  }
  if (!baseline) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, zscore: null, reason: 'no baseline supplied' };
  }
  if (!baseline.n || baseline.n < MIN_BASELINE_N) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, zscore: null, reason: `insufficient baseline population (n=${baseline.n || 0}, need >= ${MIN_BASELINE_N})` };
  }
  if (!baseline.stdev) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, zscore: null, reason: 'baseline stdev is zero -- no variation to compare against' };
  }
  const zscore = (value - baseline.mean) / baseline.stdev;
  if (threshold == null) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, zscore, reason: 'no threshold configured' };
  }
  const cmp = COMPARATORS[expr.comparator || 'gte'];
  if (!cmp) throw new Error(`security-rules: unknown comparator '${expr.comparator}'`);
  // Two independent gates, both required to flag: statistically unusual (z vs. sigma threshold)
  // AND materially significant. Materiality itself has two possible floors, either or both
  // optional, folded into ONE conjunction: `min_value` gates the computed RATE (dispatch #42 §3 --
  // e.g. INV-001's 20% variance-rate floor), `min_numerator` gates the RAW absolute numerator sum
  // (dispatch #45 §A -- e.g. INV-002's real dollar amount, since a rate can be statistically
  // unusual on a denominator so large the underlying dollars are trivial regardless of the rate).
  // Neither gate alone is sufficient when set; failing either is a real, definite "clear" verdict
  // (pass: false), not an honest-null -- the rule DID evaluate, it just didn't clear the floor.
  const statisticallyUnusual = cmp(zscore, threshold);
  const materialityOk = (expr.min_value == null || value >= num(expr.min_value))
    && !belowNumeratorFloor(expr, numeratorSum);
  return { implemented: true, pass: statisticallyUnusual && materialityOk, value, numeratorSum, denominatorSum, threshold, zscore };
}

// evaluateRule(rule, dataContext, {loc, baseline}) -> {implemented, pass, value, numeratorSum,
// denominatorSum, threshold, zscore?, reason?}. `pass` is null (not false) whenever a verdict
// can't honestly be computed -- no exposure (zero denominator OR below a per-rule
// min_denominator floor), no threshold configured, an unimplemented LOGIC_TYPE, or (z-score only)
// no/insufficient/zero-variance baseline -- so a caller summing "how many rules fired" never
// silently counts an unevaluated rule as a pass OR a fail. `baseline` is additive and
// backward-compatible: threshold/ratio rules ignore it entirely, existing callers that omit it
// keep working exactly as before.
export function evaluateRule(rule, dataContext, { loc, baseline } = {}) {
  const type = rule.logic_type;
  if (type === 'z-score') return evaluateZScoreRule(rule, dataContext, { loc, baseline });
  const evalFn = IMPLEMENTED_TYPES[type];
  if (!evalFn) {
    return { implemented: false, pass: null, value: null, reason: `logic_type '${type}' not yet implemented` };
  }
  const dataRequired = asArr(rule.data_required);
  const primary = dataRequired[0];
  const rows = (dataContext && dataContext[primary]) || [];
  const expr = asObj(rule.logic_expression);
  const { value, numeratorSum, denominatorSum } = evalFn(expr, rows);
  const threshold = resolveThreshold(rule, loc);
  if (value == null) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, reason: noExposureReason(expr, denominatorSum) };
  }
  if (threshold == null) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, reason: 'no threshold configured' };
  }
  const cmp = COMPARATORS[expr.comparator || 'gte'];
  if (!cmp) throw new Error(`security-rules: unknown comparator '${expr.comparator}'`);
  // min_numerator (dispatch #45 §A) applies here too -- the SAME shared gate z-score rules use,
  // since it's a property of the numerator field, not the logic_type. A plain ratio/threshold
  // rule crossing its own threshold on a trivial absolute amount is exactly the same false-material
  // signal z-score's min_value/min_numerator combination exists to catch.
  const materialityOk = !belowNumeratorFloor(expr, numeratorSum);
  return { implemented: true, pass: cmp(value, threshold) && materialityOk, value, numeratorSum, denominatorSum, threshold };
}
