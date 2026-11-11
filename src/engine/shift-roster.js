// @ts-nocheck
// Owner request 2026-11-11 (follow-up to the OEPE hour-level drill-down, task #132-adjacent
// messaging work). Verbatim: "Name attribution is real but inferred, not confirmed... we should
// use [it] sparingly then. When a whole shift gets it right or wrong we can list names or
// attribute them for ease of knowing who to limit research to. Nothing wrong with that. But we
// can also list out all managers present every time because that will help users and leaders
// identify the real people or person to address findings with. I am no longer concerned about
// masking names except for the rule about masking when it self incriminates a user to that role
// or someone below them. Revealing upstream is useful and warranted."
//
// Two pieces, both built here:
// 1. managersOnDuty() — list every manager-tier employee scheduled for a store/date, unmasked by
//    default (the DATA itself is already fully open — see dispatch #125 below). Reused for the
//    "list managers present every time" ask.
// 2. canRevealAttributedName() — the one masking exception that survives: a named person's
//    identity in automated FINDING TEXT is shown only to a viewer whose own role genuinely
//    outranks the named person's (approximate) role, never to their peers or subordinates.
//
// Why masking is a NARRATIVE-layer decision, not a data-access one: dispatch #125 (owner
// directive, 2026-08-25, schema-lifelenz-shift-assignments.sql) already settled that raw
// schedule/name data is NOT sensitive ("there is no reason to hide names for scheduling...
// everyone can see this data as-is") — lifelenz_shift_assignments stores employee_name directly,
// gated only by ordinary tenant+accessible_locs RLS, the same tier as every other operational
// labor table. So the masking this file implements is purely about whether an AUTOMATED FINDING
// SENTENCE should spell out a name, never about hiding the underlying schedule row (that's
// already visible elsewhere, e.g. Crew Schedule Lookup, to anyone who can see the store at all).
import { levelsAbove, DEFAULT_ROLES } from './permissions.js';

// `job_title` on lifelenz_shift_assignments is the resolved LifeLenz payroll title (e.g.
// "General Manager", "Cert. Swing Mgr.", "Crew Person") -- NOT business_role_id/role_name, which
// names the STATION worked that shift (Drive Thru, Grill, ...), not the person's job. This maps
// a job_title onto Meridian's own RBAC ladder (engine/permissions.js's DEFAULT_ROLES) ONLY for
// the masking decision below -- it is not a claim the named employee holds a Meridian login or
// that exact role; it is the closest real-ladder rung their job title corresponds to.
export function approxLadderRungForJobTitle(jobTitle) {
  const t = String(jobTitle || '').toLowerCase();
  if (!t) return null;
  if (t.includes('general manager')) return 'gm';
  if (t.includes('mgr') || t.includes('manager')) return 'sm_am_dm'; // swing/shift/dept managers
  return null; // crew -- no ladder rung; never masked (dispatch #125 precedent)
}

// Reveal a named person's identity to `viewerRoleId` only when the viewer's own role genuinely
// outranks the named person's approximate rung (levelsAbove > 0) -- mask from the named person's
// peers and anyone below them, per the owner's 2026-11-11 rule above. Crew (no ladder rung at
// all) is never masked. admin/owner are an unconditional root override, matching
// canOverrideLockedActual's identical precedent in permissions.js.
export function canRevealAttributedName(jobTitle, viewerRoleId, ladder = DEFAULT_ROLES) {
  const rung = approxLadderRungForJobTitle(jobTitle);
  if (!rung) return true;
  if (viewerRoleId === 'admin' || viewerRoleId === 'owner') return true;
  const diff = levelsAbove(rung, viewerRoleId, ladder);
  return diff != null && diff > 0;
}

// All manager-tier people scheduled anywhere in a store's shift_assignments rows for one day --
// "list out all managers present every time" (owner, 2026-11-11), not conditioned on any one
// finding having fired. Dedupes by employeeName+jobTitle (the same person can carry >1 row if
// LifeLenz split their shift across business roles), keeping the earliest shiftStart per person.
// `shiftRows` is expected pre-filtered to one store+date by the caller (see
// useBriefManagersByLoc in features/morning-brief.js) -- this function does no loc/date
// filtering itself, matching worstOepeSlot's "caller scopes, function just reduces" shape.
export function managersOnDuty(shiftRows) {
  if (!shiftRows || !shiftRows.length) return [];
  const seen = new Map();
  for (const r of shiftRows) {
    if (r.isAbsent) continue;
    const rung = approxLadderRungForJobTitle(r.jobTitle);
    if (!rung) continue;
    const name = r.employeeName || ('Employee #' + r.assignedEmploymentId);
    const key = name + '|' + r.jobTitle;
    const prior = seen.get(key);
    if (!prior || String(r.shiftStart) < String(prior.shiftStart)) {
      seen.set(key, { name, jobTitle: r.jobTitle, rung, shiftStart: r.shiftStart, shiftEnd: r.shiftEnd });
    }
  }
  return [...seen.values()].sort((a, b) => String(a.shiftStart).localeCompare(String(b.shiftStart)));
}
