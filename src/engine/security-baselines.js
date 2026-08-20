// @ts-nocheck
// ── Exposure normalization + personal/peer/store/network baselines ─────────────
// dispatch #36 (Phase 0b substrate), memory/plan-security-loss-prevention.md §1 principles
// 1-2. Checked src/engine/metric-source.js (ds-driven per-loc/date auto-first metric
// resolution) and src/engine/vs-ly.js (store-sales-vs-LY matched-day comparison) first, per
// CLAUDE.md's "source data through the shared helpers" standing rule and dispatch #36's own
// instruction -- NEITHER carries a rate-normalization or employee-level baseline primitive to
// extend (grepped both; confirmed no existing "per $1,000" or cohort-distribution helper
// exists anywhere in src/engine). This is genuinely new ground, not a 4th parallel path to an
// existing one -- but it follows the SAME conventions those two modules established: dollar-
// weighted aggregation across a window rather than averaging daily ratios ("never average an
// average" / "dollar-weight aggregates", CLAUDE.md), and honest nulls instead of 0/Infinity
// when exposure is zero (metric-source.js's own contract).
//
// Row shape: rung-2 event rows (src/utils/register-audit.js's audit_rows shape today --
// {loc, date, emp, drawerSales, drawerGC, cashOSDollar, posOverCnt, ...}). Any table with
// {loc, date, emp, <numerator field>, <denominator/exposure field>} works unchanged.
//
// Normalization unit: per $1,000 sales or per 1,000 transactions, EXACTLY
// memory/data-acquisition-shopping-list.md's convention ("we call the usage per thousand...
// to normalize a low volume store versus a highline store") -- not a new unit invented here.
export const PER_THOUSAND = 1000;

function inWindow(date, start, end) {
  return (!start || date >= start) && (!end || date <= end);
}

// The ONLY correct way to combine a rate across multiple rows for one subject: sum both legs,
// divide once, then scale. Never mean() a set of per-row percentages -- that's the exact
// "average of an average" bug CLAUDE.md's standing rule forbids elsewhere in this codebase.
// Returns null (not 0/NaN/Infinity) when there's no exposure to normalize against.
export function exposureRate(rows, { numField, denField, scale = PER_THOUSAND, abs = false }) {
  let n = 0, d = 0;
  for (const r of rows) {
    n += abs ? Math.abs(Number(r[numField]) || 0) : (Number(r[numField]) || 0);
    d += Number(r[denField]) || 0;
  }
  if (!d) return null;
  return (n / d) * scale;
}

function groupBy(rows, keyFn) {
  const g = {};
  for (const r of rows) { const k = keyFn(r); (g[k] ||= []).push(r); }
  return g;
}

// mean/stdev/n/values over a set of already-computed rates (one per population member, or one
// per day for the personal/time-series case) -- population stdev, since a baseline describes
// the observed cohort, not a sample estimate of some larger population.
function distribution(values) {
  const v = values.filter(x => x != null && Number.isFinite(x));
  const n = v.length;
  if (!n) return { mean: null, stdev: null, n: 0, values: v };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const variance = v.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
  return { mean, stdev: Math.sqrt(variance), n, values: v };
}

// ── 1. Personal baseline — is this person behaving differently than THEY normally do ────────
// Distribution is PER-DAY (one rate per qualifying row in the window) so a future z-score
// LOGIC_TYPE can compare today's rate against the subject's own historical mean/stdev.
// `overall` is the SEPARATE dollar-weighted whole-window rate (what a panel would show as
// "this employee's rate this period," and what a threshold/ratio rule should compare against)
// -- deliberately not folded into `mean`, so nothing accidentally treats the per-day average
// (wrong for a period total) as the period total (right only via `overall`).
export function personalBaseline(rows, { emp, loc, numField, denField, scale = PER_THOUSAND, abs = false, start, end }) {
  const subject = rows.filter(r => r.emp === emp && r.loc === loc && inWindow(r.date, start, end));
  const perDay = subject.map(r => exposureRate([r], { numField, denField, scale, abs }));
  return {
    ...distribution(perDay),
    overall: exposureRate(subject, { numField, denField, scale, abs }),
    recordCount: subject.length,
  };
}

// ── 2. Peer baseline — differently than comparable employees ────────────────────────────────
// Plan §1 principle 2 specifies "same role/daypart/tenure/volume band" -- audit_rows carries
// none of those dimensions today (confirmed against src/utils/register-audit.js and
// src/parsers/index.js's parseRegisterAudit column list), so this uses same-store colleagues
// as the cohort, the only grouping the data actually supports. Documented here, not silently
// assumed correct -- refining the cohort (role/daypart/tenure/volume) is future work once that
// data exists, not a redesign of this function's shape.
// One rate PER PEER MEMBER (their own dollar-weighted rate across the window) -- the
// distribution is across people, not across days.
export function peerBaseline(rows, { emp, loc, numField, denField, scale = PER_THOUSAND, abs = false, start, end, excludeSelf = true }) {
  const storeRows = rows.filter(r => r.loc === loc && inWindow(r.date, start, end) && (!excludeSelf || r.emp !== emp));
  const byEmp = groupBy(storeRows, r => r.emp);
  const values = Object.values(byEmp).map(empRows => exposureRate(empRows, { numField, denField, scale, abs }));
  return { ...distribution(values), memberCount: Object.keys(byEmp).length };
}

// ── 3. Store baseline — differently than comparable stores ──────────────────────────────────
// Subject is a STORE (all employees pooled), not a person. One rate PER OTHER STORE (that
// store's own dollar-weighted rate, all employees at that store combined) -- the distribution
// this store's own pooled rate (compute via exposureRate(rows.filter(loc===subjectLoc), ...)
// separately) gets compared against.
export function storeBaseline(rows, { loc, numField, denField, scale = PER_THOUSAND, abs = false, start, end, excludeSelf = true }) {
  const windowed = rows.filter(r => inWindow(r.date, start, end) && (!excludeSelf || r.loc !== loc));
  const byLoc = groupBy(windowed, r => r.loc);
  const values = Object.values(byLoc).map(locRows => exposureRate(locRows, { numField, denField, scale, abs }));
  return { ...distribution(values), memberCount: Object.keys(byLoc).length };
}

// ── 4. Network baseline — unusual org-wide ───────────────────────────────────────────────────
// The broadest population: every employee's own rate, org-wide, unrestricted by store --
// widens peerBaseline's cohort from "same store" to "everyone." One rate per employee.
export function networkBaseline(rows, { emp, numField, denField, scale = PER_THOUSAND, abs = false, start, end, excludeSelf = true }) {
  const windowed = rows.filter(r => inWindow(r.date, start, end) && (!excludeSelf || r.emp !== emp));
  const byEmp = groupBy(windowed, r => r.emp);
  const values = Object.values(byEmp).map(empRows => exposureRate(empRows, { numField, denField, scale, abs }));
  return { ...distribution(values), memberCount: Object.keys(byEmp).length };
}
