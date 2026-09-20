// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_forms tool. Imported directly by
// supabase/functions/sage-chat/index.ts and by its Vitest test in src/__tests__/, so the SAME
// code that runs in production is what the test exercises -- not a re-implementation of it.
// Plain JS, no TypeScript, per this file family's own convention (see labor-summary-agg.js).
//
// Reuses computeFormStoreDayRollup/computeFormSummary from src/engine/forms-completion.js -- the
// SAME store-day rollup + per-form-summary logic src/views/forms-panel.js's in-app dashboard
// already computes from qsr_forms_completion -- rather than re-deriving the pass/fail math here.
// This file only shapes raw qsr_forms_completion DB rows (snake_case) into that function's input
// shape (camelCase) and turns its output into this tool's response shape. dispatch #226 Task 1
// directly verified (deno run, real relative import + execution) that Deno CAN resolve and run a
// relative import reaching outside supabase/functions/ into src/engine/ -- see
// eom-ledger-baseline.js's own import in index.ts for the first production case of this.
import { computeFormStoreDayRollup, computeFormSummary } from '../../../src/engine/forms-completion.js';

export const FORMS_NOTE = 'pass_rate_pct is completed÷resolved (Σ, never a mean of store rates). "Resolved" excludes still-open occurrences (not yet due) -- those are neither a pass nor a miss yet. store_days_pass_rate_pct on each form is a different reading: the % of individual store-days that cleared that form\'s own threshold, which can legitimately disagree with the aggregate pass_rate_pct. Manager/person attribution is not possible from this data -- never attribute a missed form to an individual.';

/** One raw qsr_forms_completion DB row (snake_case) -> computeFormStoreDayRollup's input shape. */
export function mapFormsRow(r) {
  return {
    loc: String(parseInt(r.loc, 10)), formId: r.form_id, formTitle: r.form_title,
    occurrenceKey: r.occurrence_key, statusState: r.status_state,
  };
}

/**
 * rawRows: raw qsr_forms_completion rows (loc,form_id,form_title,occurrence_key,status_state).
 * storeNames: {loc -> display name} map (STORE_NAMES in index.ts).
 * Returns {stores, forms} -- per-store totals (worst pass-rate first) and per-form totals across
 * the range (worst-performing form first, computeFormSummary's own sort).
 */
export function aggregateFormsCompletion(rawRows, storeNames) {
  const rows = (rawRows || []).map(mapFormsRow);
  const rollup = computeFormStoreDayRollup(rows);

  const byStore = new Map();
  for (const g of rollup) {
    if (!byStore.has(g.loc)) byStore.set(g.loc, { resolvedCount: 0, completedCount: 0 });
    const s = byStore.get(g.loc);
    s.resolvedCount += g.resolvedCount;
    s.completedCount += g.completedCount;
  }
  const stores = [...byStore.entries()].map(([loc, s]) => ({
    loc, name: (storeNames && storeNames[loc]) || `Store ${loc}`,
    resolved: s.resolvedCount, completed: s.completedCount, missed: s.resolvedCount - s.completedCount,
    pass_rate_pct: s.resolvedCount ? +((s.completedCount / s.resolvedCount) * 100).toFixed(1) : null,
  })).sort((a, b) => (a.pass_rate_pct ?? 101) - (b.pass_rate_pct ?? 101));

  const forms = computeFormSummary(rollup).map(f => ({
    form_title: f.formTitle, threshold_pct: +(f.threshold * 100).toFixed(0),
    resolved: f.resolvedCount, completed: f.completedCount,
    pass_rate_pct: f.passRate != null ? +(f.passRate * 100).toFixed(1) : null,
    store_days_pass_rate_pct: f.storeDaysPassRate != null ? +(f.storeDaysPassRate * 100).toFixed(1) : null,
  }));

  return { stores, forms };
}
