// @ts-nocheck
// ── Reports-to assignment graph (dispatch #150, Performance Review continuity Phase 3a) ──────
// Generalizes src/constants.js's orgAssignments()/whoRan()/groupsAt() "latest start ≤ date
// wins" store-attribution pattern to a full person/role/target graph, per
// memory/plan-performance-review-continuity-2026-08-26.md decision #2 (quoted in full in
// memory/dispatch-150.md): an Area Supervisor (AS) covers a patch of stores, an Operations
// Manager (OM) covers 2-4 AS's patches, and a District Operator (DO) covers whatever MIX of
// OMs/AS's/stores is assigned to them -- not a uniform fixed-depth tree. So a person's full
// resolved store scope = their own directly-assigned stores UNION the (recursively resolved)
// scope of every person assigned to report to them, all evaluated at the SAME date via the
// identical "latest start ≤ date wins" rule whoRan() already proves out for the single-axis
// (store-only) case.
//
// Row shape this module consumes: { person, role, target_type: 'store'|'person', target, start,
// end } -- mirrors supabase/schema.sql's extended `staff_assignments` table (see that file's
// header comment for the full column-by-column mapping and the end_date design decision this
// dispatch's PR body documents). `start`/`end` are ISO 'YYYY-MM-DD' strings; '' or null/undefined
// `start` = "since always", matching orgAssignments()'s own convention exactly.
//
// `person` and `target` (when target_type==='person') share ONE identity space per role, by
// construction of how this dispatch's own backfill populates them (see
// scripts/backfill-staff-assignments-2026.mjs): a `geid` (QSRSoft's stable per-employee key,
// the SAME identifier review-engine.js's own `review.geid` field already uses) for
// roster-sourced GM/AM/DM/SM rows, or a plain supervisor NAME STRING for AS/OM/DO rows seeded
// from src/constants.js's existing orgAssignments()/DEF_SETTINGS.supervisorGroups (which has
// never had anything richer than a name for a supervisor identity). These two identifier kinds
// never collide in practice because only AS/OM/DO can ever be the TARGET of another person's row
// in this graph (GM/AM/DM/SM are always leaf assignees -- store-level roles, per the plan doc's
// "GM and below: always exactly one location" -- nobody's scope recurses THROUGH them), so a
// `target_type:'person'` value is always resolved against a name-string `person`, and a `geid`
// `person` value is never looked up as a target. Documented here, not silently assumed, because
// unifying AS/OM/DO onto a real roster/profile identity is real future work this dispatch does
// not attempt (no roster job-title code exists for those roles at all -- plan doc decision #5).
//
// Store-type targets are normalized through unpadLoc() (src/constants.js) on every comparison --
// roster/tenure data arrives zero-padded to 7 chars, orgAssignments()/reviews.reviewee_loc are
// unpadded -- so a caller can pass either form and still match.

import { unpadLoc } from '../constants.js';

const _dstr = d => (typeof d === 'string' ? d : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '')));
const _key = s => String(s == null ? '' : s).trim();
// Normalizes a (target_type, target) pair to a single comparable key. Store targets go through
// unpadLoc() (see header); person targets compare as plain trimmed strings.
const _targetKey = (targetType, target) => targetType === 'store' ? unpadLoc(target) : _key(target);

// Thrown by resolveScope()/whoOversees() on a cycle in the reports-to graph (A reports to B who
// reports to A) -- this should never happen in real data, but a malformed row must not
// infinite-loop the resolver. Per dispatch #150 scope: "fail loudly... don't silently truncate."
export class AssignmentCycleError extends Error {
  constructor(cycle) {
    super(`Assignment graph cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'AssignmentCycleError';
    this.cycle = cycle;
  }
}

// The single winning row for ONE target (a store OR a person), as-of `date`, among ALL rows
// naming that target (regardless of who holds it) -- the direct generalization of
// src/constants.js's whoRan(loc, date, list), which does exactly this scan but only ever for a
// store target. "Winning" = latest `start` ≤ date; a row not yet effective on `date` is skipped,
// matching whoRan()'s own skip. Returns null if nothing is effective yet for that target.
export function currentHolderOfTarget(targetType, target, date, rows) {
  const d = _dstr(date);
  const wantKey = _targetKey(targetType, target);
  let best = null, bestStart = null;
  for (const row of (rows || [])) {
    if (row.target_type !== targetType) continue;
    if (_targetKey(targetType, row.target) !== wantKey) continue;
    const s = row.start || '';
    if (s && d && s > d) continue;                 // not yet effective on `date`
    if (best === null || s >= (bestStart || '')) { best = row; bestStart = s; }
  }
  return best;
}

// Every target `person` DIRECTLY holds as-of `date` -- i.e. every distinct target named anywhere
// in `rows` whose current winning holder (currentHolderOfTarget, above) is `person`. A person can
// hold several targets at once (an AS's 3 stores are 3 different targets, not competing rows for
// the SAME target, so all 3 can resolve to that AS simultaneously) -- only rows THE SAME target
// competes on the "latest start wins" rule.
export function directTargetsOf(person, date, rows) {
  const wantPerson = _key(person);
  const seen = new Set();
  const targets = [];
  for (const row of (rows || [])) {
    const tk = `${row.target_type}:${_targetKey(row.target_type, row.target)}`;
    if (seen.has(tk)) continue;
    seen.add(tk);
    targets.push({ target_type: row.target_type, target: row.target });
  }
  const out = [];
  for (const t of targets) {
    const holder = currentHolderOfTarget(t.target_type, t.target, date, rows);
    if (holder && _key(holder.person) === wantPerson) out.push(holder);
  }
  return out;
}

// The FULL resolved store scope for `person` as-of `date`: their own directly-assigned stores
// UNION the recursively-resolved scope of every person assigned to report to them (plan doc
// decision #2's "general reports-to graph, not a fixed-depth hierarchy"). Returns an array of
// unpadded store loc codes (deduplicated). `_path` is internal (cycle tracking) -- callers pass
// only (person, date, rows).
export function resolveScope(person, date, rows, _path = []) {
  const key = _key(person);
  if (_path.includes(key)) throw new AssignmentCycleError([..._path, key]);
  const path = [..._path, key];
  const stores = new Set();
  for (const t of directTargetsOf(person, date, rows)) {
    if (t.target_type === 'store') {
      stores.add(unpadLoc(t.target));
    } else if (t.target_type === 'person') {
      for (const s of resolveScope(t.target, date, rows, path)) stores.add(s);
    }
  }
  return [...stores];
}

// The INVERSE of resolveScope(): every person responsible for store `loc` as-of `date`, walking
// UP the reports-to chain -- e.g. [GM row, AS row, OM row, DO row], each the winning
// currentHolderOfTarget() at that rung. Needed for review ROUTING (store -> who reviews/oversees
// it), the mirror image of resolveScope()'s scoring-rollup direction (person -> their stores).
// Returns [] if nobody is currently assigned to the store at all. Throws AssignmentCycleError on
// a cycle, same as resolveScope().
export function whoOversees(loc, date, rows) {
  const chain = [];
  const seen = new Set();
  let targetType = 'store', target = unpadLoc(loc);
  for (;;) {
    const holder = currentHolderOfTarget(targetType, target, date, rows);
    if (!holder) break;
    const personKey = _key(holder.person);
    if (seen.has(personKey)) throw new AssignmentCycleError([...chain.map(c => _key(c.person)), personKey]);
    seen.add(personKey);
    chain.push(holder);
    targetType = 'person';
    target = holder.person;
  }
  return chain;
}
