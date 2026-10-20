// @ts-nocheck
// ── Oil Efficiency — rollup engine (owner request 2026-10-19) ────────────────────────────────
// Pure helpers over oil_efficiency rows (shape: see parsers/oil-efficiency.js's header) for the
// ReportShell-based viewing panel in views/oil-efficiency.js.
//
// Same "never average averages" discipline as engine/conversion-efficiency.js: the 3/6/12-month
// figures are each already trailing rolling averages as of the report's own period, so a
// multi-period range collapses to each store's single LATEST period within the range, never
// averaged or summed across periods.
//
// Restaurant Impact has two distinct shapes, both real: a quantified $ cost (store is over
// target) or a "Quality Concern"/"Optimized" label (no $ figure). These are different kinds of
// signal -- a $ amount is a cost opportunity, "Quality Concern" is a food-quality risk flagged
// by the report itself regardless of dollar magnitude -- so severity ranks Quality Concern
// stores above any dollar amount, not interleaved by raw number.

export function periodsInRange(rows, range) {
  if (!range) return rows;
  const from = range.s ? String(range.s).slice(0, 7) : null;
  const to = range.e ? String(range.e).slice(0, 7) : null;
  return rows.filter(r => r.period && (!from || r.period >= from) && (!to || r.period <= to));
}

export function latestPeriodByStore(rows) {
  const byLoc = new Map();
  for (const r of rows) {
    if (!r.loc || !r.period) continue;
    const cur = byLoc.get(r.loc);
    if (!cur || r.period > cur) byLoc.set(r.loc, r.period);
  }
  return byLoc;
}

// Higher = more urgent. A "Quality Concern" label ranks above any dollar amount -- it's a
// food-quality risk the report itself flags, not a magnitude to compare against a $ figure.
function severityScore(r) {
  if (r.impact_3mo_label === 'Quality Concern') return Infinity;
  if (r.impact_3mo_dollars != null) return r.impact_3mo_dollars;
  return -Infinity;
}

// One row per store (its latest period within range), worst-severity-first.
export function buildOilEfficiencyReport(allRows, { locs, range } = {}) {
  const locSet = locs && locs.length ? new Set(locs.map(String)) : null;
  const scoped = locSet ? allRows.filter(r => locSet.has(String(r.loc))) : allRows.slice();
  const inRange = periodsInRange(scoped, range);
  const latest = latestPeriodByStore(inRange);

  const storeRows = [];
  for (const r of inRange) {
    if (latest.get(r.loc) !== r.period) continue;
    storeRows.push(r);
  }
  storeRows.sort((a, b) => severityScore(b) - severityScore(a));
  return { storeRows };
}

export function qualityConcernStores(storeRows) {
  return storeRows.filter(r => r.impact_3mo_label === 'Quality Concern');
}

export function totalImpactDollars(storeRows) {
  return storeRows.reduce((s, r) => s + (r.impact_3mo_dollars || 0), 0);
}
