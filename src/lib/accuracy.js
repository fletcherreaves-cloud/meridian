// @ts-nocheck
// ── Accuracy & Integrity primitives ──────────────────────────────────────────
// The shared math layer. Every cross-store aggregate, every rate, and every
// generated report should route through these so the system never:
//   (a) averages averages (use weightedRate / weightedMean — Σnum/Σden),
//   (b) mixes 0-1 and 0-100 scales (pctToFraction / assertInRange),
//   (c) confuses milliseconds and seconds (perUnitSeconds),
//   (d) silently drops rows past Supabase's 1000-row cap (fetchAllPages),
//   (e) joins on unpadded NSN (padLoc),
//   (f) ships a report whose parts don't reconcile (reconcile / audit).
//
// Pure JS, no imports. Unit-tested in src/__tests__/accuracy.test.js.
// Owner standing rule: correct math, never average averages, dollar-weight
// aggregates, self-audit every report.

export const isNum = (x) => typeof x === 'number' && !Number.isNaN(x) && Number.isFinite(x);
export const round = (x, dp = 2) => (isNum(x) ? Math.round(x * 10 ** dp) / 10 ** dp : x);

const _warned = new Set();
function _warn(msg) {
  try {
    if (_warned.has(msg)) return;
    _warned.add(msg);
    if (typeof console !== 'undefined' && console.warn) console.warn('[accuracy] ' + msg);
  } catch { /* no-op */ }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

// Σ fn(row) over rows, skipping non-numeric values.
export function sum(rows, fn = (x) => x) {
  let s = 0;
  for (const r of rows || []) { const v = fn(r); if (isNum(v)) s += v; }
  return s;
}

// Σnum / Σden across rows — the ONLY correct way to aggregate a ratio (speed,
// labor %, food cost %, pull-forward %, …) across stores/hours/days. You pass the
// numerator and denominator *components* per row; it sums each, then divides.
// Returns null when the denominator sums to 0 (no basis to divide by).
//   weightedRate(hours, h => h.dt_untilserve, h => h.dt_trans_cnt)  // avg DT time
export function weightedRate(rows, numFn, denFn) {
  const d = sum(rows, denFn);
  return d !== 0 ? sum(rows, numFn) / d : null;
}

// Σ(value·weight) / Σweight — dollar/count-weight a per-row metric you already
// have as a finished rate (e.g. each store's FOB% weighted by its product sales).
// This is the fix for the straight-average FOB bug. Returns null with no weight.
export function weightedMean(rows, valueFn, weightFn) {
  let n = 0, d = 0;
  for (const r of rows || []) {
    const v = valueFn(r), w = weightFn(r);
    if (isNum(v) && isNum(w)) { n += v * w; d += w; }
  }
  return d !== 0 ? n / d : null;
}

// Simple arithmetic mean — CORRECT ONLY for non-ratio quantities (counts,
// dollars, already-weighted values). Never use it on percentages/rates across
// stores; use weightedRate/weightedMean. Named explicitly so its use is a choice.
export function mean(rows, fn = (x) => x) {
  const vals = (rows || []).map(fn).filter(isNum);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ── Scale & unit safety ───────────────────────────────────────────────────────

export const pctToFraction = (x) => (isNum(x) ? x / 100 : null);
export const fractionToPct = (x) => (isNum(x) ? x * 100 : null);

// Normalize a value that SHOULD be a 0-1 fraction but may have arrived as 0-100.
// Heuristic: only coerces when clearly a percent (>1.5 and <=100) and warns once,
// so a scale mismatch surfaces in the console instead of silently skewing a tile.
// For hard correctness prefer knowing the source scale; this is a safety net.
export function asFraction(x, { label = 'value', warn = true } = {}) {
  if (!isNum(x)) return null;
  if (x > 1.5 && x <= 100.0001) { if (warn) _warn(`coerced ${label}=${x} (looked like a percent) to ${round(x / 100, 4)}`); return x / 100; }
  return x;
}

// A per-unit time in SECONDS from a summed raw time and a count. QSRSoft DAR raw
// time fields are millisecond sums, so `from` defaults to 'ms'. Guards the
// µs/ms/s unit bug. Returns null when count is 0.
export function perUnitSeconds(timeSum, count, { from = 'ms' } = {}) {
  if (!isNum(timeSum) || !isNum(count) || count === 0) return null;
  const div = from === 'us' ? 1e6 : from === 'ms' ? 1e3 : 1;
  return timeSum / count / div;
}

// Zero-pad an NSN/loc to the join width used by qsr_daily_activity (7). Accepts a
// number or string; strips to the integer first so "3708" and 3708 both → "0003708".
export function padLoc(loc, width = 7) {
  if (loc == null) return '';
  const n = parseInt(loc, 10);
  return String(Number.isNaN(n) ? loc : n).padStart(width, '0');
}

// ── Reconciliation ────────────────────────────────────────────────────────────

// Compare the SAME quantity computed from multiple sources and flag divergence
// beyond tolerance (e.g. day sales via sales_ledger vs DAR vs labor). Relative
// tolerance by default (fraction of the largest magnitude); pass {absolute:true}
// for an absolute threshold. Surfaces mismatches instead of silently picking one.
export function reconcile(named, { tolerance = 0.01, absolute = false } = {}) {
  const entries = Object.entries(named || {}).filter(([, v]) => isNum(v));
  if (entries.length < 2) return { ok: true, checked: entries.length, values: named || {}, spread: 0, detail: 'not enough sources to reconcile' };
  const vals = entries.map(([, v]) => v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const spread = max - min;
  const base = Math.max(Math.abs(max), Math.abs(min), 1e-9);
  const rel = spread / base;
  const ok = absolute ? spread <= tolerance : rel <= tolerance;
  return {
    ok, spread, relative: rel, min, max, values: named,
    detail: ok ? '' : `sources disagree: ${entries.map(([k, v]) => `${k}=${round(v)}`).join(', ')} (${absolute ? round(spread) : round(rel * 100) + '%'} > tolerance)`,
  };
}

// ── Report self-audit ─────────────────────────────────────────────────────────

// A single invariant result. Use the check* helpers or build {name, ok, detail}.
export const check = (name, ok, detail = '') => ({ name, ok: !!ok, detail: ok ? '' : detail });

// Run a set of invariant checks → overall pass + per-check results for a ✓/⚠
// badge on a generated report. Falsy entries are ignored (easy conditional checks).
export function audit(checks) {
  const list = (checks || []).filter(Boolean);
  const failed = list.filter((c) => !c.ok);
  return { pass: failed.length === 0, total: list.length, failed: failed.length, checks: list };
}

// Invariant: the row components sum to the reported total (within tolerance).
export function checkRowsSumToTotal(rows, rowFn, total, { tolerance = 0.5, name = 'rows sum to total' } = {}) {
  const s = sum(rows, rowFn);
  const diff = Math.abs(s - (isNum(total) ? total : NaN));
  return check(name, isNum(total) && diff <= tolerance, `Σrows=${round(s)} vs total=${round(total)} (Δ${round(diff)})`);
}

// Invariant: value within [lo, hi] (e.g. a percentage in [0, 100]).
export function checkInRange(value, lo, hi, name = 'in range') {
  return check(name, isNum(value) && value >= lo && value <= hi, `${name}: ${value} outside [${lo}, ${hi}]`);
}

// Invariant: every calendar day in [startISO, endISO] is present in `dates`.
export function checkDateCoverage(dates, startISO, endISO, { name = 'date coverage complete' } = {}) {
  const have = new Set(dates || []);
  const missing = [];
  const end = new Date(endISO + 'T12:00:00Z');
  for (let t = new Date(startISO + 'T12:00:00Z'); t <= end; t.setUTCDate(t.getUTCDate() + 1)) {
    const iso = t.toISOString().slice(0, 10);
    if (!have.has(iso)) missing.push(iso);
  }
  return check(name, missing.length === 0, `${missing.length} missing day(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
}

// ── Pagination (defeat the 1000-row cap) ──────────────────────────────────────

// Page a fetcher until a short page returns. fetchPage(offset, limit) must return
// an array (or a promise of one). Guards the "Supabase silently capped at 1000"
// bug. maxPages is a runaway backstop.
export async function fetchAllPages(fetchPage, { pageSize = 1000, maxPages = 100 } = {}) {
  const out = [];
  for (let p = 0; p < maxPages; p++) {
    const batch = await fetchPage(p * pageSize, pageSize);
    if (!batch || !batch.length) break;
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}
