#!/usr/bin/env node
// scripts/backfill-staff-assignments-2026.mjs
// Dispatch #150 (Performance Review continuity, Phase 3a — memory/dispatch-150.md scope item 3,
// plan doc's resolved open item A): one-time backfill reconstructing this year's real
// staff_assignments history from qsr_employee_tenure's own store_start_date/
// job_title_code_start_date, so this year's first real reviews are correctly segmented from day
// one instead of starting clean-slate at ship time.
//
// Two sources, per the dispatch's own explicit scope:
//   1. GM/DM/SM (cleanly identified by job_title_code) + AM (DM-coded, split by
//      hourly_pay_rate — plan doc decision #5's measured rule) for every CURRENTLY-ACTIVE person
//      in qsr_employee_tenure. AM and DM collapse onto the SAME ladder rung ('sm_am_dm', same as
//      review-engine.js's ROLE_KEYS -> permissions.js's REVIEW_ROLE_TO_LADDER already do) — the
//      finer AM/DM/SM distinction is preserved in `notes` for later dispatches' use (audit trail
//      per the plan doc's own recommendation), not in the `role` column, which only needs to
//      express ladder position for this dispatch's resolution engine.
//   2. Area Supervisors, seeded from src/constants.js's EXISTING orgAssignments()/
//      DEF_SETTINGS.supervisorGroups — no roster job-title code exists for AS/OM/DO at all (plan
//      doc decision #5), so this is the only real seed available. OM/DO are deliberately left
//      UNSEEDED/empty: no one holds either role in production yet (dispatch #150's own scope
//      note — Ashley Podraza's real OM promotion is still ~1 month out at time of writing).
//
// classifyRosterAssignment()/buildBackfillRows() are pure (no supabase/fetch dependency) and
// tested directly from src/__tests__/ against a synthetic qsr_employee_tenure-shaped fixture —
// same reasoning toTenureRows()/employee-roster-tenure-pull.test.js already give for testing a
// scripts/ module this way (this repo's test env has no live Supabase access).
//
// Idempotent: upserts onConflict the new (person, role, target_type, target, start_date) unique
// constraint (supabase/schema.sql), so a second run overwrites the same rows rather than
// duplicating them.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run AFTER supabase/schema.sql's staff_assignments extension has been applied (see that file's
// header comment + this dispatch's PR body for the exact statements).

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { orgAssignments, unpadLoc } from '../src/constants.js';
// Dispatch #162 (Performance Review continuity, build item #6) extracted this backfill's own
// job-code classification into src/engine/tenure-roles.js — #162's departure-detection needed the
// exact same "is this row still in a review-eligible role" logic, and this project's standing rule
// is "check whether a helper exists before writing one" rather than duplicate it. Re-exported here
// (not just imported-and-used) so this script's existing test
// (src/__tests__/backfill-staff-assignments-2026.test.js) keeps importing GM_JOB_CODES/
// DM_AM_JOB_CODES/SM_JOB_CODES/isActiveTenureRow/classifyRosterAssignment from THIS path, unchanged.
export {
  GM_JOB_CODES, DM_AM_JOB_CODES, SM_JOB_CODES, isActiveTenureRow, classifyRosterAssignment,
} from '../src/engine/tenure-roles.js';
import { isActiveTenureRow, classifyRosterAssignment } from '../src/engine/tenure-roles.js';

const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const BACKFILL_DATE_TAG = 'Backfilled 2026-08-26 (dispatch #150)';

// The later of two ISO 'YYYY-MM-DD' dates (lexical compare is safe for this format); either may
// be null. Returns null if both are null -- the assignment's precise start can't be determined,
// and buildBackfillRows() drops such a row rather than fabricating a date.
function laterDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a >= b ? a : b;
}

// One qsr_employee_tenure row -> one staff_assignments row, or null (inactive / not a
// review-eligible role bucket / no determinable start date). `start_date` = the LATER of
// store_start_date and job_title_code_start_date — the precise date THIS combination (this
// person, in this role, AT THIS STORE) became true; whichever of the two changed most recently
// is the one that actually establishes the assignment (a same-role transfer moves
// store_start_date forward without changing job_title_code_start_date, and vice versa for an
// in-place promotion).
export function rosterRowToAssignment(row) {
  if (!isActiveTenureRow(row)) return null;
  const cls = classifyRosterAssignment(row);
  if (!cls) return null;
  const start = laterDate(row.store_start_date, row.job_title_code_start_date);
  if (!start) return null;
  if (row.geid == null || String(row.geid).trim() === '') return null;
  return {
    person: String(row.geid),
    role: cls.role,
    target_type: 'store',
    target: unpadLoc(row.loc),
    start_date: start,
    end_date: null,
    notes: `${BACKFILL_DATE_TAG} from qsr_employee_tenure: job_title_code ${row.job_title_code}`
      + (row.job_title_code_description ? ` (${row.job_title_code_description})` : '')
      + ` -> suggested review role ${cls.reviewRole}.`,
  };
}

// orgAssignments()'s existing { loc, supervisor, start } timeline -> staff_assignments rows for
// Area Supervisors. A '' (since-always) start has no real known date to backfill — treated as
// effective for the whole backfill year, i.e. 2026-01-01, rather than left blank (staff_
// assignments.start_date is NOT NULL — see that table's own header comment on why this dispatch
// doesn't reuse the ''-sentinel convention at the SQL layer). A real reassignment date already
// present in the timeline (e.g. a mid-2026 supervisor change) is kept as-is.
export function asSeedAssignments(orgAssignmentRows) {
  return (orgAssignmentRows || []).map(a => ({
    person: String(a.supervisor),
    role: 'area_supervisor',
    target_type: 'store',
    target: unpadLoc(a.loc),
    start_date: a.start && a.start >= '2026-01-01' ? a.start : '2026-01-01',
    end_date: null,
    notes: `${BACKFILL_DATE_TAG} from src/constants.js orgAssignments()/DEF_SETTINGS.supervisorGroups.`,
  }));
}

// The full backfill row set: roster-derived GM/AM/DM/SM rows + AS-seeded rows. OM/DO are
// deliberately absent — no seed data exists for them (dispatch #150 scope note: no one holds
// either role in production yet).
export function buildBackfillRows({ tenureRows = [], orgAssignmentRows = [] } = {}) {
  const rosterRows = (tenureRows || []).map(rosterRowToAssignment).filter(Boolean);
  const asRows = asSeedAssignments(orgAssignmentRows);
  return [...rosterRows, ...asRows];
}

// ── Live I/O (not exercised by tests — this session has no live Supabase access) ──────────────
const PAGE = 1000;
async function fetchAllTenureRows() {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('qsr_employee_tenure')
      .select('loc, geid, employment_status, job_title_code, job_title_code_description, hourly_pay_rate, store_start_date, job_title_code_start_date, termination_entry_date')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[backfill-staff-assignments-2026] read failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function upsertAssignments(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('staff_assignments')
      .upsert(slice, { onConflict: 'person,role,target_type,target,start_date' });
    if (error) throw new Error(`[staff_assignments] ${error.message}`);
    saved += slice.length;
  }
  return saved;
}

async function main() {
  if (!supabase) { console.error('[backfill-staff-assignments-2026] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  const tenureRows = await fetchAllTenureRows();
  console.log(`[backfill-staff-assignments-2026] ${tenureRows.length} qsr_employee_tenure row(s) read`);

  const rows = buildBackfillRows({ tenureRows, orgAssignmentRows: orgAssignments() });
  const rosterCount = rows.filter(r => r.role === 'gm' || r.role === 'sm_am_dm').length;
  const asCount = rows.filter(r => r.role === 'area_supervisor').length;
  console.log(`[backfill-staff-assignments-2026] ${rows.length} assignment row(s) built (${rosterCount} roster-derived GM/AM/DM/SM, ${asCount} AS-seeded)`);
  if (!rows.length) { console.log('[backfill-staff-assignments-2026] nothing to do'); process.exit(0); }

  const saved = await upsertAssignments(rows);
  console.log(`[backfill-staff-assignments-2026] done — ${saved} row(s) upserted to staff_assignments`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[backfill-staff-assignments-2026] FATAL:', e); process.exit(1); });
}
