// @ts-nocheck
// src/engine/compliance-audit.js — Compliance Audit metrics from LifeLenz's Data Explorer
// "Compliance Audit" report (scripts/lifelenz-compliance-audit-pull.mjs,
// supabase/schema-lifelenz-compliance-audit.sql).
//
// Each raw row is ONE labor-compliance violation -- a meal/rest break violation, a minor-labor-
// law issue, etc. -- with a real DOLLAR cost (costPenalty) and HOURS cost (hourPenalty), who it
// was against, when, and whether a manager dismissed it (isDismissed/dismissalReason). This is a
// genuinely new signal for Meridian -- no compliance-violation panel existed anywhere in the app
// before this build (per CLAUDE.md's panel list).
//
// "Good use" this file exists for: a store racking up real-dollar compliance penalties is a
// concrete, measurable labor-law risk and cost, not an abstract one -- and a high DISMISSAL rate
// (violations marked dismissed without the underlying pattern changing) is itself a signal worth
// separating from the raw violation count. Per CLAUDE.md's "Voice by role" rule, every function
// here returns the plain count/dollar figure -- the "this needs a decision" framing happens in
// the consuming panel (src/views/labor-tools.js's ComplianceAuditPanel), not here.

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;

/** Per-store summary across whatever window `rows` already covers (the caller filters the
 *  window, this just aggregates it) — {loc, violationCount, costPenaltySum, hourPenaltySum,
 *  dismissedCount, dismissedRate, lastViolationAt}[], sorted by costPenaltySum descending so the
 *  stores with the biggest real-dollar exposure surface first. */
export function storeComplianceSummary(rows) {
  const byLoc = new Map();
  for (const r of (rows || [])) {
    if (!r || !r.loc) continue;
    const cur = byLoc.get(r.loc) || { loc: r.loc, violationCount: 0, costPenaltySum: 0, hourPenaltySum: 0, dismissedCount: 0, lastViolationAt: null };
    cur.violationCount += 1;
    cur.costPenaltySum += num(r.costPenalty);
    cur.hourPenaltySum += num(r.hourPenalty);
    if (r.isDismissed) cur.dismissedCount += 1;
    if (r.shiftDate && (!cur.lastViolationAt || r.shiftDate > cur.lastViolationAt)) cur.lastViolationAt = r.shiftDate;
    byLoc.set(r.loc, cur);
  }
  return [...byLoc.values()]
    .map(s => ({ ...s, dismissedRate: s.violationCount > 0 ? s.dismissedCount / s.violationCount : 0 }))
    .sort((a, b) => b.costPenaltySum - a.costPenaltySum);
}

/** Per-(loc, date) aggregate: {loc, date, violationCount, costPenaltySum, hourPenaltySum}[].
 *  This is what powers Signals' metric registry (daily, per-store) and stream-freshness. */
export function dailyComplianceAudit(rows) {
  const byKey = new Map();
  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.shiftDate) continue;
    const key = r.loc + '|' + r.shiftDate;
    const cur = byKey.get(key) || { loc: r.loc, date: r.shiftDate, violationCount: 0, costPenaltySum: 0, hourPenaltySum: 0 };
    cur.violationCount += 1;
    cur.costPenaltySum += num(r.costPenalty);
    cur.hourPenaltySum += num(r.hourPenalty);
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

/** Per-category rollup — {category, violationCount, costPenaltySum, hourPenaltySum}[], sorted
 *  by costPenaltySum descending, so the costliest VIOLATION TYPE (not store) surfaces first --
 *  answers "what kind of violation is actually costing us money," a different question than the
 *  per-store view above. Rows with no category land under 'Uncategorized' rather than being
 *  silently dropped. */
export function categoryBreakdown(rows) {
  const byCategory = new Map();
  for (const r of (rows || [])) {
    if (!r) continue;
    const category = r.category || 'Uncategorized';
    const cur = byCategory.get(category) || { category, violationCount: 0, costPenaltySum: 0, hourPenaltySum: 0 };
    cur.violationCount += 1;
    cur.costPenaltySum += num(r.costPenalty);
    cur.hourPenaltySum += num(r.hourPenalty);
    byCategory.set(category, cur);
  }
  return [...byCategory.values()].sort((a, b) => b.costPenaltySum - a.costPenaltySum);
}

/** Per-employee rollup — {employeeName, violationCount, costPenaltySum, locs: string[]}[],
 *  sorted by violationCount descending. Mirrors schedule-discipline.js's editorBreakdown shape
 *  (same "who is this recurring against" question, applied to violations instead of edits). */
export function employeeViolationSummary(rows) {
  const byEmployee = new Map();
  for (const r of (rows || [])) {
    if (!r || !r.employeeName) continue;
    const cur = byEmployee.get(r.employeeName) || { employeeName: r.employeeName, violationCount: 0, costPenaltySum: 0, locs: new Set() };
    cur.violationCount += 1;
    cur.costPenaltySum += num(r.costPenalty);
    if (r.loc) cur.locs.add(r.loc);
    byEmployee.set(r.employeeName, cur);
  }
  return [...byEmployee.values()]
    .map(e => ({ ...e, locs: [...e.locs] }))
    .sort((a, b) => b.violationCount - a.violationCount);
}
