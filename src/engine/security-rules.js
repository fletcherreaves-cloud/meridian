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
//   threshold: { field, agg: 'sum'|'count'|'avg', denominator?: {field, agg}, scale?, comparator }
//   ratio:     { numerator: {field, agg, abs?}, denominator: {field, agg}, scale, comparator }
// Both normalize against exposure when a denominator is present (plan §1 principle 1) using
// `scale`, which IS memory/data-acquisition-shopping-list.md's per-$1,000-sales /
// per-1,000-transactions convention (scale: 1000) -- not a free parameter each rule invents.
//
// z-score / sequence / window-function are STUBBED: evaluateRule() returns
// {implemented:false, pass:null} for these rather than throwing, so a rule row of ANY
// LOGIC_TYPE the schema accommodates can exist today without every consumer needing its own
// type-check first. Building these out is Phase 2 (change-point detection) / Phase 3 (sequence
// engine) -- explicitly out of scope for this dispatch.

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

function evalRatio(expr, rows) {
  const numeratorSum = aggField(rows, expr.numerator.field, expr.numerator.agg || 'sum', { abs: !!expr.numerator.abs });
  const denominatorSum = aggField(rows, expr.denominator.field, expr.denominator.agg || 'sum');
  if (!denominatorSum) return { value: null, numeratorSum, denominatorSum: 0 };
  const scale = expr.scale || 1;
  return { value: (numeratorSum / denominatorSum) * scale, numeratorSum, denominatorSum };
}

function evalThreshold(expr, rows) {
  const numeratorSum = aggField(rows, expr.field, expr.agg || 'sum');
  if (!expr.denominator) return { value: numeratorSum, numeratorSum, denominatorSum: null };
  const denominatorSum = aggField(rows, expr.denominator.field, expr.denominator.agg || 'sum');
  if (!denominatorSum) return { value: null, numeratorSum, denominatorSum: 0 };
  const scale = expr.scale || 1;
  return { value: (numeratorSum / denominatorSum) * scale, numeratorSum, denominatorSum };
}

const IMPLEMENTED_TYPES = { threshold: evalThreshold, ratio: evalRatio };

// evaluateRule(rule, dataContext, {loc}) -> {implemented, pass, value, numeratorSum,
// denominatorSum, threshold, reason?}. `pass` is null (not false) whenever a verdict can't
// honestly be computed -- no exposure (zero denominator), no threshold configured, or an
// unimplemented LOGIC_TYPE -- so a caller summing "how many rules fired" never silently counts
// an unevaluated rule as a pass OR a fail.
export function evaluateRule(rule, dataContext, { loc } = {}) {
  const type = rule.logic_type;
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
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, reason: 'no exposure (zero denominator) in window' };
  }
  if (threshold == null) {
    return { implemented: true, pass: null, value, numeratorSum, denominatorSum, threshold, reason: 'no threshold configured' };
  }
  const cmp = COMPARATORS[expr.comparator || 'gte'];
  if (!cmp) throw new Error(`security-rules: unknown comparator '${expr.comparator}'`);
  return { implemented: true, pass: cmp(value, threshold), value, numeratorSum, denominatorSum, threshold };
}
