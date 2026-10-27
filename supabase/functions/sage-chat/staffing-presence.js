// @ts-nocheck
// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_staffing_presence tool.
// Imported directly by supabase/functions/sage-chat/index.ts and by its Vitest test in
// src/__tests__/, so the SAME code that runs in production is what the test exercises. Plain
// JS, no TypeScript, per repo convention.
//
// 2026-10-27: SAGE had no way to answer staffing/presence questions at all -- confirmed during
// diagnosis of the "never finishes" bug (final-round-nudge.js) that a question about GMs/DMs
// working more closing shifts was categorically unanswerable with SAGE's prior 12 tools. This
// reuses the SAME GM_JOB_CODES/DM_AM_JOB_CODES/SM_JOB_CODES classification already used
// elsewhere in this repo (src/engine/tenure-roles.js, built for performance-review role
// classification) rather than re-deriving it, per the repo's own "check whether a helper
// exists before writing one" standing rule.
//
// PII handling (CLAUDE.md's standing rule): qsr_punch_times carries employee_name and geid
// directly on every row. This module NEVER reads or returns employee_name, and geid is used
// ONLY to count distinct people per role (a Set, discarded after computing .size) -- the raw
// geid values never leave this function. The caller (index.ts) must select ONLY
// loc,start_date_time,end_date_time,job_title_code,geid -- never employee_name -- from
// qsr_punch_times.
import { GM_JOB_CODES, DM_AM_JOB_CODES, SM_JOB_CODES } from '../../../src/engine/tenure-roles.js';

// Every store in this fleet (Oklahoma + Florida panhandle, per constants.js's INV_ORG_COORDS)
// is America/Chicago -- a single timezone for the whole district, so no per-store lookup needed.
const CENTRAL_TZ = 'America/Chicago';

// hourCycle:'h23' is explicit, not hour12:false, per this repo's own hard-learned lesson
// (CLAUDE.md Dev Rules: a Node-version-dependent ICU default broke main for 7 commits once --
// hour12:false alone leaves midnight's hourCycle to the runtime's default).
export function localHour(isoString) {
  if (!isoString) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(isoString));
  const h = parts.find((p) => p.type === 'hour')?.value;
  return h != null ? Number(h) : null;
}

export function classifyPunchRole(jobTitleCode) {
  const code = jobTitleCode != null ? Number(jobTitleCode) : null;
  if (code == null || Number.isNaN(code)) return 'other';
  if (GM_JOB_CODES.includes(code)) return 'gm';
  if (SM_JOB_CODES.includes(code)) return 'sm';
  if (DM_AM_JOB_CODES.includes(code)) return 'dm_am';
  return 'other';
}

// afterLocalHour: a shift counts only if it STARTED at or after this local clock hour (0-23).
// null/undefined = no filter, every shift counts. Hours reported are the shift's FULL duration,
// never clipped to the window -- see STAFFING_PRESENCE_NOTE, the contract the model actually
// reads.
export function aggregateStaffingPresence(rows, storeNames = {}, afterLocalHour = null) {
  const byStore = {};
  for (const row of rows) {
    if (!row.start_date_time) continue;
    const startHour = localHour(row.start_date_time);
    if (afterLocalHour != null && (startHour == null || startHour < afterLocalHour)) continue;

    // qsr_punch_times.loc is zero-padded at the DB level (confirmed live, "0003708"); STORE_NAMES
    // keys are unpadded -- same normalization lifelenz-labor-agg.js already does for the same
    // reason, or every row falls back to the generated "Store 00XXXXX" label.
    const loc = String(parseInt(row.loc, 10));
    const role = classifyPunchRole(row.job_title_code);
    const hours = row.end_date_time
      ? (new Date(row.end_date_time).getTime() - new Date(row.start_date_time).getTime()) / 3600000
      : 0;

    if (!byStore[loc]) {
      byStore[loc] = {
        gm: { shifts: 0, hours: 0, people: new Set() },
        dm_am: { shifts: 0, hours: 0, people: new Set() },
        sm: { shifts: 0, hours: 0, people: new Set() },
        other: { shifts: 0, hours: 0, people: new Set() },
      };
    }
    const bucket = byStore[loc][role];
    bucket.shifts += 1;
    if (hours > 0) bucket.hours += hours;
    if (row.geid) bucket.people.add(row.geid); // discarded below -- only .size is ever returned
  }

  return Object.entries(byStore)
    .map(([loc, roles]) => ({
      loc,
      name: storeNames[loc] || `Store ${loc}`,
      gm_shifts: roles.gm.shifts, gm_hours: +roles.gm.hours.toFixed(1), gm_distinct_people: roles.gm.people.size,
      dm_am_shifts: roles.dm_am.shifts, dm_am_hours: +roles.dm_am.hours.toFixed(1), dm_am_distinct_people: roles.dm_am.people.size,
      sm_shifts: roles.sm.shifts, sm_hours: +roles.sm.hours.toFixed(1), sm_distinct_people: roles.sm.people.size,
      crew_other_shifts: roles.other.shifts, crew_other_hours: +roles.other.hours.toFixed(1),
    }))
    .sort((a, b) => (b.gm_shifts + b.dm_am_shifts) - (a.gm_shifts + a.dm_am_shifts));
}

export const STAFFING_PRESENCE_NOTE =
  'Role is classified from job_title_code (src/engine/tenure-roles.js, same mapping the '
  + 'performance-review system uses): gm = GM-coded punches, dm_am = DM/AM-coded, sm = '
  + 'Certified Swing/Shift-Manager-coded, crew_other = everything else. A shift counts only '
  + 'when it STARTED at or after the requested after_local_hour -- hours reported are the FULL '
  + 'shift duration, not clipped to the window. All times are converted to America/Chicago local '
  + 'time (every store in this district shares one timezone). '
  + 'IMPORTANT, confirmed repeatedly across this district: GM and most DM/AM roles are commonly '
  + 'salaried-exempt and do not use the time clock at all. Zero or near-zero gm_shifts/dm_am_shifts '
  + 'does NOT mean no GM/DM was present -- it most often means this data source cannot see them; '
  + 'say so plainly rather than treating it as evidence of absence. '
  + 'Never state or imply a named individual\'s attendance, performance, or schedule from this '
  + 'data -- report only these role-level, store-level aggregates. This tool never returns names '
  + 'or employee ids, only counts.';
