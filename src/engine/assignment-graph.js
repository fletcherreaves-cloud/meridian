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

// Dispatch #151 (Performance Review continuity, Phase 3b) — thin client-side wrapper around
// whoOversees(), NOT a second implementation of the chain-walk, for UI gating: "does `person`
// have any oversight relationship to `loc` as of `date`" (e.g. deciding whether to render a
// review edit affordance at all, before the user attempts a write RLS will reject).
//
// This is the JS-side sibling of the SQL function public.person_oversees_loc()
// (supabase/schema.sql) that the new `reviews` RLS policies actually enforce with. THEY CAN
// DRIFT if one changes without the other — same caution dispatch #149 flagged for
// role_level()/review_role_to_ladder() mirroring permissions.js. Two deliberate differences from
// the SQL version, both because a client-side gating check has different failure requirements
// than an RLS predicate evaluated per-row on every query:
//   - The SQL function depth-caps the walk (returns false past 10 rungs) because an RLS
//     predicate can't throw per-row without breaking every query touching a cyclic record. This
//     JS function has no such constraint, so it reuses whoOversees() as-is (no depth cap) and
//     simply catches AssignmentCycleError -> false, rather than re-deriving a capped walk.
//   - A malformed/unknown `person` still safely returns false here (whoOversees() never throws
//     for "nobody assigned"/"unknown person" -- it throws only on an actual cycle).
export function personOversees(person, loc, date, rows) {
  const want = _key(person);
  if (!want) return false;
  try {
    return whoOversees(loc, date, rows).some(r => _key(r.person) === want);
  } catch (e) {
    if (e instanceof AssignmentCycleError) return false;
    throw e;
  }
}

// ── Dispatch #154 (Performance Review continuity, Phase 5a) ────────────────────────────────────
// A person's own role/store assignment TIMELINE across a date range with possibly MULTIPLE
// transitions — distinct from every function above, all of which resolve the graph AS OF ONE
// POINT IN TIME only. Needed for promotion/transfer segmented scoring (plan doc decision #3): a
// manager who transfers stores or is promoted mid-year must have each review period scored
// against the role/store that was ACTUALLY true then, not blended into one snapshot.
//
// Lives here, not review-engine.js, because it is pure reports-to-graph data — it reads only
// `staff_assignments` rows and orders them by time — with no review/scoring concept involved at
// all; review-engine.js's own new computeSegmentedReview (dispatch #154) imports this and turns
// it into scores, keeping resolution logic in exactly ONE place, per dispatch #150's own rule.
//
// Deliberately NOT a graph walk (resolveScope/whoOversees) — it reads only ONE person's own rows,
// target_type:'store' only (GM/AM/DM/SM are always leaf assignees per this file's header
// comment, so a person's OWN timeline is always a sequence of STORE assignments, never a sequence
// of "reports to a different person" rows) and orders them by time, not by recursive scope
// resolution. Cycle-safety (AssignmentCycleError) does not apply here for exactly that reason —
// this never walks "who reports to whom", only "what did THIS person hold, when".
//
// Resolution rule: IDENTICAL to every other function in this file — "latest start ≤ date wins",
// generalized across a whole date range instead of one date (the next row's `start` implicitly
// ends the prior one; `end_date` is not consulted, matching dispatch #150's own resolved
// end_date-is-advisory-only decision — see this file's header + supabase/schema.sql's comment).
// A malformed input (two rows for the same person with the SAME start — no clear "latest start"
// winner) resolves the SAME way currentHolderOfTarget's own tie-break already does (`s >=
// bestStart` favors the LATER row in input-array order on a tie): the earlier of the two
// collapses to a zero-width, dropped segment, and the later one's `start` becomes the real
// cutover — no second resolution rule invented, no crash.
//
// Returns an ORDERED array of `{role, loc, start, end}` segments, clipped to
// `[periodStart, periodEnd]`, covering every row overlapping the period. Returns `[]` if the
// person has no `staff_assignments` rows at all — callers (computeSegmentedReview) treat that
// the SAME as "one full-period segment" by falling back to the review's own role/loc, since both
// mean "there is nothing to split on, score the whole period as one segment." A period with
// exactly one applicable row (the common case — most people never transfer or get promoted mid-
// review) returns exactly one segment spanning the whole (clipped) period — cheap and correct,
// not just an edge case handled separately.
export function personAssignmentTimeline(person, periodStart, periodEnd, rows) {
  const want = _key(person);
  const ps = _dstr(periodStart), pe = _dstr(periodEnd);
  const own = (rows || [])
    .filter(r => r.target_type === 'store' && _key(r.person) === want)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.start || '').localeCompare(b.r.start || '') || (a.i - b.i))
    .map(x => x.r);
  const segs = [];
  for (let i = 0; i < own.length; i++) {
    const row = own[i];
    const rowStart = row.start || '';
    const segStart = rowStart > ps ? rowStart : ps;
    if (segStart > pe) break; // this row (and every later one, since sorted ascending) starts after the period
    const nextStart = i + 1 < own.length ? (own[i + 1].start || '') : null;
    const segEnd = (nextStart && nextStart <= pe) ? _dayBefore(nextStart) : pe;
    if (segEnd < segStart) continue; // zero/negative width -- a same-start tie's shadowed row
    segs.push({ role: row.role, loc: unpadLoc(row.target), start: segStart, end: segEnd });
  }
  return segs;
}

function _dayBefore(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
