// @ts-nocheck
// ── Labor basis resolver (#153) ───────────────────────────────────────────────
// A store's target object carries FOUR labor-percent fields — tLabor, tCrewLabor,
// tBonusLabor, tCombLabor — and until this file existed every consumer picked one
// by reading the field name inline. That produced six competing "the labor
// target" numbers with no single owner (issue #153): computeOpsScore graded on
// tLabor while the approval cycle only ever populates tCrewLabor, and
// computeLaborRow's column L took a THIRD number — a stale hand-typed snapshot
// off the manually-uploaded MBI workbook — agreeing with neither.
//
// This is the one named place. Every reader of "the labor % target" routes
// through resolveLaborTarget() instead of touching a field name directly, so
// switching the basis later (an org-level accounting choice, explicitly NOT
// built here — see the issue thread) is a default-value change in one function,
// not a re-audit of every caller.
export const LABOR_BASIS_FIELDS = {
  tCrewLabor:  { label: 'Crew Labor %',     status: 'authoritative' }, // sent to operators mid-month for approval; monthly_targets.crew_labor_pct
  tLabor:      { label: 'Labor % (legacy)', status: 'legacy' },        // static only, no monthly path — the field the bug graded on
  tBonusLabor: { label: 'Bonus Labor %',    status: 'reserved' },      // deliberately reserved, not dead code — may be used next year
  tCombLabor:  { label: 'Combined Labor %', status: 'reserved' },      // deliberately reserved — org isn't set up for combined accounting yet
};

export const DEFAULT_LABOR_BASIS = 'tCrewLabor';

// Resolve a store's labor % target from its (already layer-resolved) target
// object. `basis` defaults to tCrewLabor per the owner's decision; a future
// per-org basis setting is a parameter here, not a rewrite.
export function resolveLaborTarget(t, basis = DEFAULT_LABOR_BASIS) {
  if (!t) return null;
  const v = t[basis];
  return typeof v === 'number' ? v : null;
}
